#!/usr/bin/env python3
"""
AWS Infrastructure Uninstaller for travel-map.

Deletes resources created by installer.py:
  API Gateway, Lambda, IAM role, CloudFront (+ OAI), S3 bucket.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional

import boto3
from botocore.exceptions import ClientError

project_name = "travel-map"
region = "us-west-2"

bucket_name_prefix = "storage-for-travel-map"
bucket_name = ""

lambda_api_name = "lambda-api-travel-map"
lambda_api_role_name = "lambda-api-travel-map-role"
api_name = "api-travel-map"

script_dir = os.path.dirname(os.path.abspath(__file__))

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


def resolve_bucket_name(acct_id: str, aws_region: str) -> str:
    return f"{bucket_name_prefix}-{acct_id}-{aws_region}".lower()


def _cloudfront_comment() -> str:
    return f"CloudFront-S3-for-{project_name}"


def _oai_comment() -> str:
    return f"OAI for {project_name} web"


def load_config() -> Dict:
    config_path = os.path.join(script_dir, "config.json")
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            content = f.read().strip()
            if content:
                return json.loads(content)
    except (FileNotFoundError, json.JSONDecodeError, OSError) as e:
        logger.debug(f"Could not load config.json: {e}")
    return {}


def update_config_json(deletion_summary: Dict):
    config_path = os.path.join(script_dir, "config.json")
    config_data = load_config()
    for key in (
        "bucketName",
        "s3Arn",
        "s3Path",
        "webS3Prefix",
        "cloudfrontId",
        "cloudfrontDomain",
        "cloudfrontUrl",
        "websiteUrl",
        "apiGatewayId",
        "apiGatewayUrl",
        "apiGatewayHealthUrl",
        "apiToursUrl",
        "lambdaApiName",
        "lambdaApiArn",
    ):
        config_data.pop(key, None)

    config_data.update(
        {
            "projectName": project_name,
            "accountId": account_id,
            "region": region,
            "deploymentStatus": "uninstalled",
            "uninstalledAt": datetime.now(timezone.utc).isoformat(),
            "deletionSummary": deletion_summary,
        }
    )
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config_data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    logger.info(f"✓ Updated {config_path}")


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


def delete_api_gateway(config: Dict) -> bool:
    logger.info("Deleting API Gateway")
    api_id = (config.get("apiGatewayId") or "").strip()
    if not api_id:
        found = _find_http_api_by_name(api_name)
        api_id = (found or {}).get("ApiId") or ""
    if not api_id:
        logger.warning("  No API Gateway id found")
        return False
    try:
        apigatewayv2_client.delete_api(ApiId=api_id)
        logger.info(f"✓ Deleted API Gateway: {api_id}")
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] == "NotFoundException":
            logger.info("  API Gateway already gone")
            return True
        logger.error(f"  Failed to delete API Gateway: {e}")
        return False


def delete_lambda_function(function_name: str) -> bool:
    logger.info(f"Deleting Lambda: {function_name}")
    try:
        lambda_client.delete_function(FunctionName=function_name)
        logger.info(f"✓ Deleted Lambda: {function_name}")
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            logger.info("  Lambda already gone")
            return True
        logger.error(f"  Failed to delete Lambda: {e}")
        return False


def delete_iam_role(role_name: str) -> bool:
    logger.info(f"Deleting IAM role: {role_name}")
    try:
        attached = iam_client.list_attached_role_policies(RoleName=role_name).get(
            "AttachedPolicies"
        ) or []
        for policy in attached:
            iam_client.detach_role_policy(
                RoleName=role_name, PolicyArn=policy["PolicyArn"]
            )
        inline = iam_client.list_role_policies(RoleName=role_name).get("PolicyNames") or []
        for policy_name in inline:
            iam_client.delete_role_policy(RoleName=role_name, PolicyName=policy_name)
        iam_client.delete_role(RoleName=role_name)
        logger.info(f"✓ Deleted IAM role: {role_name}")
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] == "NoSuchEntity":
            logger.info("  IAM role already gone")
            return True
        logger.error(f"  Failed to delete IAM role: {e}")
        return False


def _matches_cloudfront(dist: dict) -> bool:
    return _cloudfront_comment() in (dist.get("Comment") or "")


def disable_cloudfront_distributions(config: Dict) -> bool:
    logger.info("Disabling CloudFront distributions")
    dist_id = (config.get("cloudfrontId") or "").strip()
    disabled_any = False
    try:
        distributions = cloudfront_client.list_distributions()
        for dist in distributions.get("DistributionList", {}).get("Items", []) or []:
            if dist_id and dist.get("Id") != dist_id and not _matches_cloudfront(dist):
                continue
            if not dist_id and not _matches_cloudfront(dist):
                continue
            if not dist.get("Enabled", True):
                logger.info(f"  Already disabled: {dist['Id']}")
                disabled_any = True
                continue
            current_id = dist["Id"]
            logger.info(f"  Disabling: {current_id}")
            cfg_resp = cloudfront_client.get_distribution_config(Id=current_id)
            cfg = cfg_resp["DistributionConfig"]
            cfg["Enabled"] = False
            cloudfront_client.update_distribution(
                Id=current_id,
                DistributionConfig=cfg,
                IfMatch=cfg_resp["ETag"],
            )
            disabled_any = True
        if disabled_any:
            logger.info("✓ CloudFront disable requested")
        else:
            logger.warning("No matching CloudFront distribution found")
        return disabled_any
    except Exception as e:
        logger.error(f"Error disabling CloudFront: {e}")
        return False


def wait_for_cloudfront_disabled(
    config: Dict, max_wait: int = 600, poll_interval: int = 20
) -> bool:
    logger.info("  Waiting for CloudFront to become disabled...")
    dist_id = (config.get("cloudfrontId") or "").strip()
    waited = 0
    while waited < max_wait:
        still = []
        distributions = cloudfront_client.list_distributions()
        for dist in distributions.get("DistributionList", {}).get("Items", []) or []:
            if dist_id and dist.get("Id") != dist_id and not _matches_cloudfront(dist):
                continue
            if not dist_id and not _matches_cloudfront(dist):
                continue
            if dist.get("Enabled", True):
                still.append(dist["Id"])
        if not still:
            logger.info("  ✓ Matching CloudFront distributions disabled")
            return True
        logger.info(f"  Still enabled: {still} ({waited}s/{max_wait}s)")
        time.sleep(poll_interval)
        waited += poll_interval
    logger.warning("  Timed out waiting for CloudFront disable")
    return False


def delete_cloudfront_distributions(config: Dict) -> bool:
    logger.info("Deleting CloudFront distributions")
    dist_id = (config.get("cloudfrontId") or "").strip()
    deleted = False
    try:
        distributions = cloudfront_client.list_distributions()
        for dist in distributions.get("DistributionList", {}).get("Items", []) or []:
            if dist_id and dist.get("Id") != dist_id and not _matches_cloudfront(dist):
                continue
            if not dist_id and not _matches_cloudfront(dist):
                continue
            if dist.get("Enabled", True):
                logger.info(f"  Skipping enabled distribution: {dist['Id']}")
                continue
            current_id = dist["Id"]
            try:
                cfg_resp = cloudfront_client.get_distribution_config(Id=current_id)
                cloudfront_client.delete_distribution(
                    Id=current_id, IfMatch=cfg_resp["ETag"]
                )
                logger.info(f"  ✓ Deleted distribution: {current_id}")
                deleted = True
            except ClientError as e:
                code = e.response["Error"]["Code"]
                if code in {"DistributionNotDisabled", "NoSuchDistribution"}:
                    logger.info(f"  Skip {current_id}: {code}")
                else:
                    logger.warning(f"  Could not delete {current_id}: {e}")
        if deleted:
            logger.info("✓ CloudFront distributions processed")
        return deleted
    except Exception as e:
        logger.error(f"Error deleting CloudFront: {e}")
        return False


def delete_cloudfront_oai() -> bool:
    logger.info("Deleting CloudFront Origin Access Identities")
    deleted = False
    try:
        oai_list = cloudfront_client.list_cloud_front_origin_access_identities()
        for oai in oai_list.get("CloudFrontOriginAccessIdentityList", {}).get(
            "Items", []
        ) or []:
            if _oai_comment() not in (oai.get("Comment") or ""):
                continue
            oai_id = oai["Id"]
            try:
                cfg = cloudfront_client.get_cloud_front_origin_access_identity_config(
                    Id=oai_id
                )
                cloudfront_client.delete_cloud_front_origin_access_identity(
                    Id=oai_id, IfMatch=cfg["ETag"]
                )
                logger.info(f"  ✓ Deleted OAI: {oai_id}")
                deleted = True
            except ClientError as e:
                if e.response["Error"]["Code"] != "NoSuchCloudFrontOriginAccessIdentity":
                    logger.warning(f"  Could not delete OAI {oai_id}: {e}")
    except Exception as e:
        logger.warning(f"  Error deleting OAI: {e}")
    return deleted


def empty_s3_bucket(target_bucket: str):
    try:
        paginator = s3_client.get_paginator("list_object_versions")
        delete_keys: List[Dict[str, str]] = []
        for page in paginator.paginate(Bucket=target_bucket):
            for version in page.get("Versions", []):
                delete_keys.append(
                    {"Key": version["Key"], "VersionId": version["VersionId"]}
                )
            for marker in page.get("DeleteMarkers", []):
                delete_keys.append(
                    {"Key": marker["Key"], "VersionId": marker["VersionId"]}
                )
        if delete_keys:
            for i in range(0, len(delete_keys), 1000):
                batch = delete_keys[i : i + 1000]
                s3_client.delete_objects(
                    Bucket=target_bucket, Delete={"Objects": batch}
                )
            logger.info(
                f"  ✓ Deleted {len(delete_keys)} objects/versions from {target_bucket}"
            )

        paginator = s3_client.get_paginator("list_objects_v2")
        object_keys = []
        for page in paginator.paginate(Bucket=target_bucket):
            for obj in page.get("Contents", []):
                object_keys.append({"Key": obj["Key"]})
        if object_keys:
            for i in range(0, len(object_keys), 1000):
                batch = object_keys[i : i + 1000]
                s3_client.delete_objects(
                    Bucket=target_bucket, Delete={"Objects": batch}
                )
            logger.info(f"  ✓ Deleted {len(object_keys)} objects from {target_bucket}")
    except ClientError as e:
        if e.response["Error"]["Code"] != "NoSuchBucket":
            raise


def delete_s3_bucket() -> bool:
    logger.info(f"Deleting S3 bucket: {bucket_name}")
    if not bucket_name:
        logger.warning("S3 bucket name is empty, skipping")
        return False
    try:
        empty_s3_bucket(bucket_name)
        s3_client.delete_bucket(Bucket=bucket_name)
        logger.info(f"✓ S3 bucket deleted: {bucket_name}")
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] == "NoSuchBucket":
            logger.info("  S3 bucket already gone")
            return True
        logger.error(f"  Failed to delete S3 bucket: {e}")
        return False


def main():
    global region, sts_client, account_id, bucket_name
    global s3_client, iam_client, lambda_client, apigatewayv2_client, cloudfront_client

    parser = argparse.ArgumentParser(
        description="AWS Infrastructure Uninstaller for travel-map"
    )
    parser.add_argument("--region", default=region, help=f"AWS region (default: {region})")
    parser.add_argument(
        "--keep-cloudfront",
        action="store_true",
        help="Do not disable/delete CloudFront or OAI",
    )
    parser.add_argument(
        "--keep-s3",
        action="store_true",
        help="Do not empty/delete the S3 bucket",
    )
    parser.add_argument(
        "--yes",
        "-y",
        action="store_true",
        help="Skip confirmation prompt",
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

    config = load_config()
    bucket_name = (
        (config.get("bucketName") or "").strip()
        or resolve_bucket_name(account_id, region)
    )

    logger.info("=" * 60)
    logger.info(f"Project: {project_name}")
    logger.info(f"Account: {account_id}")
    logger.info(f"Region:  {region}")
    logger.info(f"Bucket:  {bucket_name}")
    logger.info("=" * 60)

    if not args.yes:
        answer = input("Delete travel-map AWS resources? [y/N]: ").strip().lower()
        if answer not in ("y", "yes"):
            logger.info("Aborted")
            return

    deletion_summary: Dict[str, bool] = {}
    delete_cf = not args.keep_cloudfront
    delete_s3 = not args.keep_s3

    try:
        if delete_cf:
            deletion_summary["cloudfrontDisable"] = disable_cloudfront_distributions(
                config
            )

        deletion_summary["apiGateway"] = delete_api_gateway(config)
        deletion_summary["lambda"] = delete_lambda_function(
            config.get("lambdaApiName") or lambda_api_name
        )
        deletion_summary["iamRole"] = delete_iam_role(lambda_api_role_name)

        if delete_cf:
            wait_for_cloudfront_disabled(config)
            deletion_summary["cloudfront"] = delete_cloudfront_distributions(config)
            deletion_summary["cloudfrontOai"] = delete_cloudfront_oai()

        if delete_s3:
            deletion_summary["s3Bucket"] = delete_s3_bucket()

        update_config_json(deletion_summary)
        logger.info("=" * 60)
        logger.info("✓ Uninstall complete")
        logger.info(f"  Summary: {json.dumps(deletion_summary)}")
        logger.info("=" * 60)
    except Exception:
        logger.exception("Uninstaller failed")
        raise


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.error("Interrupted")
        sys.exit(130)
    except Exception as exc:
        logger.exception(f"Uninstaller failed: {exc}")
        sys.exit(1)
