#!/usr/bin/env python3
"""
AWS Infrastructure Installer for travel-map.

Deploys:
  - S3 bucket (static site under web/)
  - CloudFront + OAI (serves S3 web/)
  - Lambda (Python) + HTTP API Gateway (/health, /tours)

Static assets are uploaded from this project root:
  index.html, css/, js/, data/  →  s3://{bucket}/web/
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import mimetypes
import os
import sys
import time
import zipfile
from datetime import datetime, timezone
from typing import Dict, List, Optional

import boto3
from botocore.exceptions import ClientError

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
project_name = "travel-map"
region = "us-west-2"

bucket_name_prefix = "storage-for-travel-map"
bucket_name = ""

lambda_api_name = "lambda-api-travel-map"
lambda_api_role_name = "lambda-api-travel-map-role"
api_name = "api-travel-map"
lambda_python_runtime = "python3.13"

WEB_S3_PREFIX = "web"
WEB_UPLOAD_ENTRIES = ("index.html", "css", "js", "data", "photos")

script_dir = os.path.dirname(os.path.abspath(__file__))
lambda_api_dir = os.path.join(script_dir, "lambda-api")
tours_geojson_path = os.path.join(script_dir, "data", "tours.geojson")

sts_client = boto3.client("sts", region_name=region)
account_id = sts_client.get_caller_identity()["Account"]

s3_client = boto3.client("s3", region_name=region)
iam_client = boto3.client("iam", region_name=region)
lambda_client = boto3.client("lambda", region_name=region)
apigatewayv2_client = boto3.client("apigatewayv2", region_name=region)
cloudfront_client = boto3.client("cloudfront", region_name="us-east-1")


def setup_logging(log_level=logging.INFO):
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[logging.StreamHandler()],
    )
    return logging.getLogger(__name__)


logger = setup_logging()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def resolve_bucket_name(acct_id: str, aws_region: str) -> str:
    return f"{bucket_name_prefix}-{acct_id}-{aws_region}".lower()


def _cloudfront_comment() -> str:
    return f"CloudFront-S3-for-{project_name}"


def _oai_comment() -> str:
    return f"OAI for {project_name} web"


def load_config_json() -> Dict:
    config_path = os.path.join(script_dir, "config.json")
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            content = f.read().strip()
            if content:
                return json.loads(content)
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        pass
    return {}


def load_bucket_name_from_config() -> Optional[str]:
    return (load_config_json().get("bucketName") or "").strip() or None


def update_config_json(resource_info: Dict):
    config_path = os.path.join(script_dir, "config.json")
    config_data = load_config_json()
    config_data.update(resource_info)
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config_data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    logger.info(f"✓ Updated {config_path}")


def wait_for_iam_role(role_name: str, max_wait: int = 30, propagation_delay: int = 10):
    waited = 0
    while waited < max_wait:
        try:
            iam_client.get_role(RoleName=role_name)
            break
        except ClientError:
            time.sleep(2)
            waited += 2
    else:
        logger.warning(f"IAM role {role_name} may not exist yet")
    time.sleep(propagation_delay)


def create_iam_role(
    role_name: str,
    assume_role_policy: Dict,
    managed_policies: Optional[List[str]] = None,
) -> str:
    try:
        role = iam_client.get_role(RoleName=role_name)
        logger.warning(f"IAM role already exists: {role_name}")
        role_arn = role["Role"]["Arn"]
    except ClientError as e:
        if e.response["Error"]["Code"] != "NoSuchEntity":
            raise
        role = iam_client.create_role(
            RoleName=role_name,
            AssumeRolePolicyDocument=json.dumps(assume_role_policy),
            Description=f"Execution role for {project_name}",
            Tags=[{"Key": "Project", "Value": project_name}],
        )
        role_arn = role["Role"]["Arn"]
        logger.info(f"✓ IAM role created: {role_name}")

    for policy_arn in managed_policies or []:
        try:
            iam_client.attach_role_policy(RoleName=role_name, PolicyArn=policy_arn)
        except ClientError as err:
            logger.warning(f"attach_role_policy {policy_arn}: {err}")

    wait_for_iam_role(role_name)
    return role_arn


def attach_inline_policy(role_name: str, policy_name: str, policy_document: Dict):
    iam_client.put_role_policy(
        RoleName=role_name,
        PolicyName=policy_name,
        PolicyDocument=json.dumps(policy_document),
    )


# ---------------------------------------------------------------------------
# S3
# ---------------------------------------------------------------------------
def verify_s3_bucket_access(target_bucket: Optional[str] = None) -> bool:
    target_bucket = target_bucket or bucket_name
    try:
        s3_client.head_bucket(Bucket=target_bucket)
        return True
    except ClientError:
        return False


def configure_s3_bucket(target_bucket: Optional[str] = None):
    target_bucket = target_bucket or bucket_name
    s3_client.put_public_access_block(
        Bucket=target_bucket,
        PublicAccessBlockConfiguration={
            "BlockPublicAcls": True,
            "IgnorePublicAcls": True,
            "BlockPublicPolicy": True,
            "RestrictPublicBuckets": True,
        },
    )
    s3_client.put_bucket_versioning(
        Bucket=target_bucket,
        VersioningConfiguration={"Status": "Suspended"},
    )


def create_s3_bucket() -> Dict[str, str]:
    logger.info(f"Creating S3 bucket: {bucket_name}")
    if verify_s3_bucket_access():
        logger.warning(f"S3 bucket already exists: {bucket_name}")
        configure_s3_bucket()
    else:
        try:
            if region == "us-east-1":
                s3_client.create_bucket(Bucket=bucket_name)
            else:
                s3_client.create_bucket(
                    Bucket=bucket_name,
                    CreateBucketConfiguration={"LocationConstraint": region},
                )
            configure_s3_bucket()
            logger.info(f"✓ S3 bucket created: {bucket_name}")
        except ClientError as e:
            code = e.response["Error"]["Code"]
            if code in ("BucketAlreadyOwnedByYou", "BucketAlreadyExists"):
                if not verify_s3_bucket_access():
                    raise RuntimeError(
                        f"S3 bucket '{bucket_name}' exists but is not accessible"
                    )
                logger.warning(f"S3 bucket already exists: {bucket_name}")
                configure_s3_bucket()
            else:
                raise

    return {
        "bucketName": bucket_name,
        "s3Arn": f"arn:aws:s3:::{bucket_name}",
        "s3Path": f"s3://{bucket_name}",
    }


# ---------------------------------------------------------------------------
# Lambda + API Gateway
# ---------------------------------------------------------------------------
def create_lambda_execution_role(role_name: str) -> str:
    assume_role_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {"Service": "lambda.amazonaws.com"},
                "Action": "sts:AssumeRole",
            }
        ],
    }
    return create_iam_role(
        role_name,
        assume_role_policy,
        managed_policies=[
            "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
        ],
    )


def package_lambda_api(source_dir: str) -> bytes:
    """Zip lambda_function.py + tours.geojson."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        handler = os.path.join(source_dir, "lambda_function.py")
        if not os.path.isfile(handler):
            raise FileNotFoundError(f"Missing {handler}")
        zf.write(handler, "lambda_function.py")

        tours_src = tours_geojson_path
        if not os.path.isfile(tours_src):
            raise FileNotFoundError(f"Missing {tours_src}")
        zf.write(tours_src, "tours.geojson")
    buffer.seek(0)
    return buffer.read()


def lambda_function_exists(function_name: str) -> bool:
    try:
        lambda_client.get_function(FunctionName=function_name)
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            return False
        raise


def wait_for_lambda_ready(function_name: str):
    waiter = lambda_client.get_waiter("function_updated")
    waiter.wait(FunctionName=function_name)


def deploy_lambda_api(role_arn: str) -> str:
    logger.info(f"Deploying Lambda function: {lambda_api_name}")
    zip_bytes = package_lambda_api(lambda_api_dir)
    environment = {
        "PROJECT_NAME": project_name,
        "BUCKET_NAME": bucket_name,
    }

    if not lambda_function_exists(lambda_api_name):
        for attempt in range(6):
            try:
                resp = lambda_client.create_function(
                    FunctionName=lambda_api_name,
                    Runtime=lambda_python_runtime,
                    Role=role_arn,
                    Handler="lambda_function.lambda_handler",
                    Code={"ZipFile": zip_bytes},
                    Description=f"{project_name} API (health, tours)",
                    Timeout=15,
                    MemorySize=256,
                    Environment={"Variables": environment},
                    Tags={"Project": project_name},
                )
                arn = resp["FunctionArn"]
                logger.info(f"✓ Lambda created: {arn}")
                return arn
            except ClientError as e:
                msg = e.response["Error"].get("Message", "")
                if (
                    e.response["Error"]["Code"] == "InvalidParameterValueException"
                    and "cannot be assumed by Lambda" in msg
                    and attempt < 5
                ):
                    wait = 5 * (attempt + 1)
                    logger.warning(f"IAM not ready, retry in {wait}s")
                    time.sleep(wait)
                    continue
                if (
                    e.response["Error"]["Code"] == "ResourceConflictException"
                    and "already exist" in msg.lower()
                ):
                    break
                raise

    logger.warning(f"Updating existing Lambda: {lambda_api_name}")
    lambda_client.update_function_code(
        FunctionName=lambda_api_name, ZipFile=zip_bytes
    )
    wait_for_lambda_ready(lambda_api_name)
    lambda_client.update_function_configuration(
        FunctionName=lambda_api_name,
        Role=role_arn,
        Handler="lambda_function.lambda_handler",
        Runtime=lambda_python_runtime,
        Timeout=15,
        MemorySize=256,
        Environment={"Variables": environment},
    )
    wait_for_lambda_ready(lambda_api_name)
    arn = lambda_client.get_function(FunctionName=lambda_api_name)["Configuration"][
        "FunctionArn"
    ]
    logger.info(f"✓ Lambda updated: {arn}")
    return arn


def _find_http_api_by_name(name: str) -> Optional[Dict]:
    try:
        paginator = apigatewayv2_client.get_paginator("get_apis")
        for page in paginator.paginate():
            for api in page.get("Items") or []:
                if api.get("Name") == name:
                    return api
    except ClientError as e:
        logger.warning(f"list APIs: {e}")
    return None


def create_api_gateway(lambda_arn: str) -> Dict[str, str]:
    logger.info(f"Creating API Gateway HTTP API: {api_name}")
    existing = _find_http_api_by_name(api_name)
    if existing:
        api_id = existing["ApiId"]
        api_endpoint = existing["ApiEndpoint"]
        logger.warning(f"HTTP API already exists: {api_name} ({api_id})")
    else:
        created = apigatewayv2_client.create_api(
            Name=api_name,
            ProtocolType="HTTP",
            Description=f"{project_name} public API",
            CorsConfiguration={
                "AllowOrigins": ["*"],
                "AllowMethods": ["GET", "OPTIONS"],
                "AllowHeaders": ["content-type", "authorization"],
                "MaxAge": 300,
            },
            Tags={"Project": project_name},
        )
        api_id = created["ApiId"]
        api_endpoint = created["ApiEndpoint"]
        logger.info(f"✓ HTTP API created: {api_id}")

    integrations = apigatewayv2_client.get_integrations(ApiId=api_id).get("Items") or []
    integration_id = None
    for integ in integrations:
        if integ.get("IntegrationUri") == lambda_arn:
            integration_id = integ["IntegrationId"]
            break
    if not integration_id and integrations:
        for integ in integrations:
            if integ.get("IntegrationType") == "AWS_PROXY":
                integration_id = integ["IntegrationId"]
                apigatewayv2_client.update_integration(
                    ApiId=api_id,
                    IntegrationId=integration_id,
                    IntegrationUri=lambda_arn,
                    PayloadFormatVersion="2.0",
                    TimeoutInMillis=15000,
                )
                break
    if not integration_id:
        integ = apigatewayv2_client.create_integration(
            ApiId=api_id,
            IntegrationType="AWS_PROXY",
            IntegrationUri=lambda_arn,
            PayloadFormatVersion="2.0",
            TimeoutInMillis=15000,
        )
        integration_id = integ["IntegrationId"]
        logger.info(f"✓ Integration created: {integration_id}")

    existing_routes = {
        r["RouteKey"]: r["RouteId"]
        for r in (apigatewayv2_client.get_routes(ApiId=api_id).get("Items") or [])
    }
    for route_key in ("GET /health", "GET /tours", "OPTIONS /health", "OPTIONS /tours"):
        if route_key in existing_routes:
            continue
        try:
            apigatewayv2_client.create_route(
                ApiId=api_id,
                RouteKey=route_key,
                Target=f"integrations/{integration_id}",
            )
            logger.info(f"  Route created: {route_key}")
        except ClientError as e:
            if e.response["Error"]["Code"] != "ConflictException":
                raise

    try:
        apigatewayv2_client.create_stage(
            ApiId=api_id,
            StageName="$default",
            AutoDeploy=True,
        )
        logger.info("✓ Stage $default created")
    except ClientError as e:
        if e.response["Error"]["Code"] not in ("ConflictException", "BadRequestException"):
            raise

    source_arn = f"arn:aws:execute-api:{region}:{account_id}:{api_id}/*/*"
    try:
        lambda_client.add_permission(
            FunctionName=lambda_api_name,
            StatementId=f"apigw-{api_name}",
            Action="lambda:InvokeFunction",
            Principal="apigateway.amazonaws.com",
            SourceArn=source_arn,
        )
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceConflictException":
            raise

    health_url = f"{api_endpoint}/health"
    tours_url = f"{api_endpoint}/tours"
    logger.info(f"✓ API ready: health={health_url}")
    return {
        "apiGatewayId": api_id,
        "apiGatewayUrl": api_endpoint,
        "apiGatewayHealthUrl": health_url,
        "apiToursUrl": tours_url,
        "lambdaApiName": lambda_api_name,
        "lambdaApiArn": lambda_arn,
    }


# ---------------------------------------------------------------------------
# CloudFront + static web
# ---------------------------------------------------------------------------
def discover_web_resources() -> Dict[str, str]:
    logger.info("Discovering S3 / CloudFront for web hosting")
    cfg = load_config_json()
    found: Dict[str, str] = {}

    target_bucket = (
        cfg.get("bucketName") or bucket_name or resolve_bucket_name(account_id, region)
    )
    if verify_s3_bucket_access(target_bucket):
        found["bucketName"] = target_bucket
        found["s3Arn"] = f"arn:aws:s3:::{target_bucket}"
        found["s3Path"] = f"s3://{target_bucket}"
        logger.info(f"  ✓ S3 bucket: {target_bucket}")

    comment = _cloudfront_comment()
    try:
        marker = None
        while True:
            kwargs: Dict = {}
            if marker:
                kwargs["Marker"] = marker
            resp = cloudfront_client.list_distributions(**kwargs)
            dist_list = resp.get("DistributionList") or {}
            for dist in dist_list.get("Items") or []:
                if comment in (dist.get("Comment") or ""):
                    found["cloudfrontId"] = dist["Id"]
                    found["cloudfrontDomain"] = dist["DomainName"]
                    found["cloudfrontUrl"] = f"https://{dist['DomainName']}"
                    logger.info(
                        f"  ✓ CloudFront: {dist['DomainName']} ({dist['Id']})"
                    )
                    break
            if found.get("cloudfrontId"):
                break
            if not dist_list.get("IsTruncated"):
                break
            marker = dist_list.get("NextMarker")
    except ClientError as e:
        logger.warning(f"  Could not list CloudFront distributions: {e}")

    return found


def _ensure_cloudfront_oai() -> str:
    oai_cmt = _oai_comment()
    try:
        oai_list = cloudfront_client.list_cloud_front_origin_access_identities(
            MaxItems="100"
        )
        items = (oai_list.get("CloudFrontOriginAccessIdentityList") or {}).get(
            "Items"
        ) or []
        for oai in items:
            if oai_cmt in (oai.get("Comment") or ""):
                logger.info(f"  Using existing OAI: {oai['Id']}")
                return oai["Id"]
    except ClientError as e:
        logger.debug(f"list OAI: {e}")

    oai_response = cloudfront_client.create_cloud_front_origin_access_identity(
        CloudFrontOriginAccessIdentityConfig={
            "CallerReference": f"{project_name}-web-oai-{int(time.time())}",
            "Comment": oai_cmt,
        }
    )
    oai_id = oai_response["CloudFrontOriginAccessIdentity"]["Id"]
    logger.info(f"  Created OAI: {oai_id}")
    return oai_id


def _merge_s3_cloudfront_bucket_policy(s3_bucket_name: str, oai_id: str) -> None:
    oai = cloudfront_client.get_cloud_front_origin_access_identity(Id=oai_id)
    canonical_user = oai["CloudFrontOriginAccessIdentity"]["S3CanonicalUserId"]
    cf_statement = {
        "Sid": "AllowCloudFrontWebAccess",
        "Effect": "Allow",
        "Principal": {"CanonicalUser": canonical_user},
        "Action": "s3:GetObject",
        "Resource": f"arn:aws:s3:::{s3_bucket_name}/{WEB_S3_PREFIX}/*",
    }
    policy: Dict = {"Version": "2012-10-17", "Statement": []}
    try:
        existing = s3_client.get_bucket_policy(Bucket=s3_bucket_name)
        policy = json.loads(existing["Policy"])
    except ClientError as e:
        if e.response["Error"]["Code"] not in ("NoSuchBucketPolicy", "NoSuchBucket"):
            raise

    statements = policy.get("Statement") or []
    if isinstance(statements, dict):
        statements = [statements]
    statements = [
        s
        for s in statements
        if not (isinstance(s, dict) and s.get("Sid") == "AllowCloudFrontWebAccess")
    ]
    statements.append(cf_statement)
    policy["Statement"] = statements
    s3_client.put_bucket_policy(Bucket=s3_bucket_name, Policy=json.dumps(policy))
    logger.info("  Updated S3 bucket policy for CloudFront web access")


def create_cloudfront_distribution(s3_bucket_name: str) -> Dict[str, str]:
    logger.info("Creating CloudFront distribution (S3 web)")
    discovered = discover_web_resources()
    if discovered.get("cloudfrontId") and discovered.get("cloudfrontDomain"):
        return {
            "id": discovered["cloudfrontId"],
            "domain": discovered["cloudfrontDomain"],
        }

    oai_id = _ensure_cloudfront_oai()
    time.sleep(5)
    _merge_s3_cloudfront_bucket_policy(s3_bucket_name, oai_id)

    origin_id = f"s3-{project_name}-web"
    distribution_config = {
        "CallerReference": f"{project_name}-web-{int(time.time())}",
        "Comment": _cloudfront_comment(),
        "DefaultRootObject": "index.html",
        "DefaultCacheBehavior": {
            "TargetOriginId": origin_id,
            "ViewerProtocolPolicy": "redirect-to-https",
            "AllowedMethods": {
                "Quantity": 2,
                "Items": ["GET", "HEAD"],
                "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]},
            },
            "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
            "Compress": True,
        },
        "Origins": {
            "Quantity": 1,
            "Items": [
                {
                    "Id": origin_id,
                    "DomainName": f"{s3_bucket_name}.s3.{region}.amazonaws.com",
                    "OriginPath": f"/{WEB_S3_PREFIX}",
                    "S3OriginConfig": {
                        "OriginAccessIdentity": (
                            f"origin-access-identity/cloudfront/{oai_id}"
                        )
                    },
                }
            ],
        },
        "Enabled": True,
        "PriceClass": "PriceClass_200",
    }

    response = cloudfront_client.create_distribution(
        DistributionConfig=distribution_config
    )
    distribution_id = response["Distribution"]["Id"]
    distribution_domain = response["Distribution"]["DomainName"]
    logger.info(f"✓ CloudFront created: {distribution_domain}")
    return {"id": distribution_id, "domain": distribution_domain}


def write_web_config_js(
    api_gateway_url: str = "",
    api_gateway_health_url: str = "",
    api_tours_url: str = "",
    website_url: str = "",
) -> str:
    js_dir = os.path.join(script_dir, "js")
    os.makedirs(js_dir, exist_ok=True)
    path = os.path.join(js_dir, "config.js")
    prior = load_config_json()
    api_base = (api_gateway_url or prior.get("apiGatewayUrl") or "").rstrip("/")
    health = (
        api_gateway_health_url
        or prior.get("apiGatewayHealthUrl")
        or (f"{api_base}/health" if api_base else "")
    )
    tours = (
        api_tours_url
        or prior.get("apiToursUrl")
        or (f"{api_base}/tours" if api_base else "")
    )
    site = website_url or prior.get("websiteUrl") or prior.get("cloudfrontUrl") or ""
    content = (
        "// Generated by installer.py — do not edit by hand for deploy.\n"
        "window.APP_CONFIG = {\n"
        f"  projectName: {json.dumps(project_name)},\n"
        f"  apiGatewayUrl: {json.dumps(api_base)},\n"
        f"  apiGatewayHealthUrl: {json.dumps(health)},\n"
        f"  apiToursUrl: {json.dumps(tours)},\n"
        f"  websiteUrl: {json.dumps(site)},\n"
        "};\n"
    )
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    logger.info(f"✓ Wrote {path}")
    return path


def _iter_web_files():
    """Yield (absolute_path, relative_web_key_suffix) for upload."""
    for entry in WEB_UPLOAD_ENTRIES:
        full = os.path.join(script_dir, entry)
        if os.path.isfile(full):
            yield full, entry.replace(os.sep, "/")
            continue
        if not os.path.isdir(full):
            logger.warning(f"  Skip missing path: {entry}")
            continue
        for root, dirs, files in os.walk(full):
            dirs[:] = [d for d in dirs if not d.startswith(".") and d != "__pycache__"]
            for filename in sorted(files):
                if filename.startswith("."):
                    continue
                filepath = os.path.join(root, filename)
                rel = os.path.relpath(filepath, script_dir).replace(os.sep, "/")
                yield filepath, rel


def upload_web_to_s3(
    s3_bucket_name: str,
    api_gateway_url: str = "",
    api_gateway_health_url: str = "",
    api_tours_url: str = "",
    website_url: str = "",
) -> int:
    logger.info(f"Uploading web assets → s3://{s3_bucket_name}/{WEB_S3_PREFIX}/")
    write_web_config_js(
        api_gateway_url, api_gateway_health_url, api_tours_url, website_url
    )

    uploaded = 0
    for filepath, rel in _iter_web_files():
        key = f"{WEB_S3_PREFIX}/{rel}"
        filename = os.path.basename(filepath)
        content_type, _ = mimetypes.guess_type(filename)
        if filename.endswith(".js"):
            content_type = "application/javascript"
        elif filename.endswith(".css"):
            content_type = "text/css"
        elif filename.endswith(".html"):
            content_type = "text/html; charset=utf-8"
        elif filename.endswith(".geojson") or filename.endswith(".json"):
            content_type = "application/geo+json"
        elif filename.endswith(".md"):
            content_type = "text/markdown; charset=utf-8"
        elif filename.endswith((".jpg", ".jpeg")):
            content_type = "image/jpeg"
        elif filename.endswith(".png"):
            content_type = "image/png"
        elif filename.endswith(".webp"):
            content_type = "image/webp"
        extra = {"ContentType": content_type or "application/octet-stream"}
        if filename in ("config.js", "index.html", "app.js", "tours.geojson"):
            extra["CacheControl"] = "no-cache, max-age=0"
        else:
            extra["CacheControl"] = "public, max-age=300"
        s3_client.upload_file(filepath, s3_bucket_name, key, ExtraArgs=extra)
        uploaded += 1
        logger.info(f"  ↑ {key}")

    logger.info(f"✓ Uploaded {uploaded} files")
    return uploaded


def invalidate_cloudfront(distribution_id: str) -> None:
    if not distribution_id:
        return
    try:
        cloudfront_client.create_invalidation(
            DistributionId=distribution_id,
            InvalidationBatch={
                "Paths": {"Quantity": 1, "Items": ["/*"]},
                "CallerReference": f"{project_name}-web-{int(time.time())}",
            },
        )
        logger.info(f"✓ CloudFront invalidation submitted: {distribution_id}")
    except ClientError as e:
        logger.warning(f"CloudFront invalidation skipped: {e}")


def deploy_web_stack(
    s3_bucket_name: str,
    api_gateway_url: str = "",
    api_gateway_health_url: str = "",
    api_tours_url: str = "",
) -> Dict[str, str]:
    discovered = discover_web_resources()
    target_bucket = s3_bucket_name or discovered.get("bucketName") or bucket_name
    if not target_bucket:
        raise RuntimeError("S3 bucket name is required for web deploy")

    prior = load_config_json()
    api_base = api_gateway_url or prior.get("apiGatewayUrl") or ""
    health = api_gateway_health_url or prior.get("apiGatewayHealthUrl") or ""
    tours = api_tours_url or prior.get("apiToursUrl") or ""

    cf = create_cloudfront_distribution(target_bucket)
    website_url = f"https://{cf['domain']}"
    upload_web_to_s3(
        target_bucket,
        api_gateway_url=api_base,
        api_gateway_health_url=health,
        api_tours_url=tours,
        website_url=website_url,
    )
    invalidate_cloudfront(cf["id"])

    return {
        "bucketName": target_bucket,
        "s3Arn": f"arn:aws:s3:::{target_bucket}",
        "s3Path": f"s3://{target_bucket}",
        "webS3Prefix": WEB_S3_PREFIX,
        "cloudfrontId": cf["id"],
        "cloudfrontDomain": cf["domain"],
        "cloudfrontUrl": website_url,
        "websiteUrl": website_url,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    global region, sts_client, account_id, bucket_name
    global s3_client, iam_client, lambda_client, apigatewayv2_client, cloudfront_client

    parser = argparse.ArgumentParser(
        description="AWS Infrastructure Installer for travel-map (S3 + CloudFront + Lambda API)"
    )
    parser.add_argument("--region", default=region, help=f"AWS region (default: {region})")
    parser.add_argument(
        "--web-only",
        action="store_true",
        help="Only upload static web + invalidate CloudFront (reuse existing API/bucket)",
    )
    parser.add_argument(
        "--skip-web",
        action="store_true",
        help="Skip CloudFront / static web deploy",
    )
    args = parser.parse_args()

    region = args.region
    sts_client = boto3.client("sts", region_name=region)
    account_id = sts_client.get_caller_identity()["Account"]
    s3_client = boto3.client("s3", region_name=region)
    iam_client = boto3.client("iam", region_name=region)
    lambda_client = boto3.client("lambda", region_name=region)
    apigatewayv2_client = boto3.client("apigatewayv2", region_name=region)
    cloudfront_client = boto3.client("cloudfront", region_name="us-east-1")

    prior = load_config_json()
    bucket_name = (
        load_bucket_name_from_config()
        or resolve_bucket_name(account_id, region)
    )

    logger.info("=" * 60)
    logger.info(f"Project: {project_name}")
    logger.info(f"Account: {account_id}")
    logger.info(f"Region:  {region}")
    logger.info(f"Bucket:  {bucket_name}")
    logger.info("=" * 60)

    resource_info: Dict = {
        "projectName": project_name,
        "accountId": account_id,
        "region": region,
        "deploymentStatus": "in_progress",
        "deployedAt": datetime.now(timezone.utc).isoformat(),
    }

    try:
        if args.web_only:
            web = deploy_web_stack(
                bucket_name,
                api_gateway_url=prior.get("apiGatewayUrl", ""),
                api_gateway_health_url=prior.get("apiGatewayHealthUrl", ""),
                api_tours_url=prior.get("apiToursUrl", ""),
            )
            resource_info.update(web)
            resource_info["deploymentStatus"] = "deployed"
            update_config_json(resource_info)
            logger.info(f"Website: {web.get('websiteUrl')}")
            return

        s3_info = create_s3_bucket()
        resource_info.update(s3_info)

        role_arn = create_lambda_execution_role(lambda_api_role_name)
        lambda_arn = deploy_lambda_api(role_arn)
        api_info = create_api_gateway(lambda_arn)
        resource_info.update(api_info)

        if not args.skip_web:
            web = deploy_web_stack(
                bucket_name,
                api_gateway_url=api_info.get("apiGatewayUrl", ""),
                api_gateway_health_url=api_info.get("apiGatewayHealthUrl", ""),
                api_tours_url=api_info.get("apiToursUrl", ""),
            )
            resource_info.update(web)

        resource_info["deploymentStatus"] = "deployed"
        update_config_json(resource_info)

        logger.info("=" * 60)
        logger.info("✓ Deployment complete")
        if resource_info.get("websiteUrl"):
            logger.info(f"  Website: {resource_info['websiteUrl']}")
        if resource_info.get("apiGatewayHealthUrl"):
            logger.info(f"  Health:  {resource_info['apiGatewayHealthUrl']}")
        if resource_info.get("apiToursUrl"):
            logger.info(f"  Tours:   {resource_info['apiToursUrl']}")
        logger.info("=" * 60)
    except Exception:
        resource_info["deploymentStatus"] = "failed"
        update_config_json(resource_info)
        raise


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.error("Interrupted")
        sys.exit(130)
    except Exception as exc:
        logger.exception(f"Installer failed: {exc}")
        sys.exit(1)
