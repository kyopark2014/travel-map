#!/usr/bin/env python3
"""
API for travel-map.

Routes (API Gateway HTTP API → Lambda proxy):
  GET  /health      — health check
  GET  /tours       — Hokkaido tour GeoJSON
  POST /transcribe  — speech translate (ja2ko | ko2ja)
  POST /speak       — Amazon Polly TTS (Japanese)
"""

from __future__ import annotations

import base64
import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, Tuple

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TOURS_PATH = Path(__file__).resolve().parent / "tours.geojson"
VOXTRAL_MODEL_ID = os.environ.get(
    "VOXTRAL_MODEL_ID", "mistral.voxtral-small-24b-2507"
)
POLLY_VOICE_JA = os.environ.get("POLLY_VOICE_JA", "Kazuha")
POLLY_ENGINE = os.environ.get("POLLY_ENGINE", "neural")
MAX_AUDIO_BYTES = 3 * 1024 * 1024
MAX_SPEAK_CHARS = 1500

bedrock_runtime = boto3.client(
    "bedrock-runtime",
    region_name=os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION"),
)
polly = boto3.client(
    "polly",
    region_name=os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION"),
)


def _response(status: int, body: Any, *, cors: bool = True) -> Dict[str, Any]:
    headers = {"Content-Type": "application/json"}
    if cors:
        headers.update(
            {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
                "Access-Control-Allow-Headers": "content-type,authorization",
            }
        )
    return {
        "statusCode": status,
        "headers": headers,
        "body": body if isinstance(body, str) else json.dumps(body, ensure_ascii=False),
    }


def _load_tours() -> Dict[str, Any]:
    if not TOURS_PATH.is_file():
        raise FileNotFoundError(f"Missing {TOURS_PATH}")
    with TOURS_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def _parse_body(event: Dict[str, Any]) -> Dict[str, Any]:
    raw = event.get("body") or ""
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8", errors="replace")
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode("utf-8", errors="replace")
    if not raw:
        return {}
    return json.loads(raw)


def _normalize_audio_format(fmt: str) -> str:
    value = (fmt or "wav").strip().lower().lstrip(".")
    aliases = {
        "wave": "wav",
        "x-wav": "wav",
        "mpeg": "mp3",
        "mpga": "mp3",
        "x-m4a": "mp4",
        "m4a": "mp4",
        "webm": "ogg",
        "opus": "opus",
    }
    value = aliases.get(value, value)
    allowed = {"aac", "flac", "mkv", "mp3", "mp4", "ogg", "opus", "wav"}
    if value not in allowed:
        raise ValueError(f"Unsupported audio format: {fmt}")
    return value


def _extract_text(result: Dict[str, Any]) -> str:
    output = result.get("output") or {}
    message = output.get("message") or {}
    parts = message.get("content") or []
    texts = []
    for part in parts:
        if isinstance(part, dict) and part.get("text"):
            texts.append(str(part["text"]).strip())
    return "\n".join(t for t in texts if t).strip()


def _clean_model_text(text: str) -> str:
    value = (text or "").strip()
    value = re.sub(
        r"^(?:JA|JP|日本語|KO|KR|한국어|韓国語|翻訳|번역)\s*[:：]\s*",
        "",
        value,
        flags=re.IGNORECASE,
    )
    if (value.startswith('"') and value.endswith('"')) or (
        value.startswith("「") and value.endswith("」")
    ):
        value = value[1:-1].strip()
    return value


def _converse_audio(audio_bytes: bytes, audio_format: str, prompt: str) -> str:
    fmt = _normalize_audio_format(audio_format)
    response = bedrock_runtime.converse(
        modelId=VOXTRAL_MODEL_ID,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "audio": {
                            "format": fmt,
                            "source": {"bytes": audio_bytes},
                        }
                    },
                    {"text": prompt},
                ],
            }
        ],
        inferenceConfig={"maxTokens": 2048, "temperature": 0},
    )
    return _clean_model_text(_extract_text(response))


def _converse_text(prompt: str, *, temperature: float = 0.2) -> str:
    response = bedrock_runtime.converse(
        modelId=VOXTRAL_MODEL_ID,
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        inferenceConfig={"maxTokens": 2048, "temperature": temperature},
    )
    return _clean_model_text(_extract_text(response))


def _speech_to_korean(audio_bytes: bytes, audio_format: str) -> Tuple[str, str]:
    """일한: Japanese speech → Korean only (1 step)."""
    prompt = (
        "この音声は日本語です。内容を理解し、自然な韓国語に翻訳してください。"
        "出力は韓国語（ハングル）の翻訳文のみ。"
        "日本語の文字起こし・前置き・説明・引用符・ラベルは一切付けないでください。"
        "한국어 번역 문장만 출력하세요."
    )
    korean = _converse_audio(audio_bytes, audio_format, prompt)
    logger.info("ja2ko=%s", korean[:200])
    return korean, VOXTRAL_MODEL_ID


def _parse_ja_and_pronunciation(text: str) -> Tuple[str, str]:
    """Parse 'JA:' / '발음:' labeled output; fallback to whole text as Japanese."""
    japanese = ""
    pronunciation = ""
    leftover: list[str] = []
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line:
            continue
        if re.match(r"^(?:JA|JP|日本語|일본어)\s*[:：]", line, flags=re.IGNORECASE):
            japanese = re.sub(
                r"^(?:JA|JP|日本語|일본어)\s*[:：]\s*",
                "",
                line,
                flags=re.IGNORECASE,
            ).strip()
            continue
        if re.match(
            r"^(?:발음|發音|Pron(?:unciation)?|読み|ヨミ|かな)\s*[:：]",
            line,
            flags=re.IGNORECASE,
        ):
            pronunciation = re.sub(
                r"^(?:발음|發音|Pron(?:unciation)?|読み|ヨミ|かな)\s*[:：]\s*",
                "",
                line,
                flags=re.IGNORECASE,
            ).strip()
            continue
        leftover.append(line)

    # Same-line: "JA: … 발음: …"
    if japanese and re.search(r"(?:발음|發音)\s*[:：]", japanese):
        parts = re.split(r"(?:발음|發音)\s*[:：]\s*", japanese, maxsplit=1)
        japanese = parts[0].strip()
        if len(parts) > 1 and not pronunciation:
            pronunciation = parts[1].strip()

    if not japanese:
        joined = "\n".join(leftover) if leftover else _clean_model_text(text)
        if re.search(r"(?:발음|發音)\s*[:：]", joined):
            parts = re.split(r"(?:발음|發音)\s*[:：]\s*", joined, maxsplit=1)
            japanese = parts[0].strip()
            japanese = re.sub(
                r"^(?:JA|JP|日本語|일본어)\s*[:：]\s*",
                "",
                japanese,
                flags=re.IGNORECASE,
            ).strip()
            if len(parts) > 1 and not pronunciation:
                pronunciation = parts[1].strip()
        else:
            japanese = joined

    pronunciation = re.sub(
        r"^(?:발음|發音|Pron(?:unciation)?)\s*[:：]\s*",
        "",
        pronunciation or "",
        flags=re.IGNORECASE,
    ).strip()
    # Drop accidental duplicate of pronunciation inside japanese
    if pronunciation and pronunciation in japanese:
        japanese = japanese.replace(pronunciation, "").strip()
    japanese = re.sub(
        r"(?:발음|發音)\s*[:：]\s*.*$",
        "",
        japanese,
        flags=re.IGNORECASE | re.DOTALL,
    ).strip()
    return japanese, pronunciation


def _speech_ko_then_ja(
    audio_bytes: bytes, audio_format: str
) -> Tuple[str, str, str, str]:
    """한일: listen Korean → write Korean → Japanese + Hangul pronunciation."""
    stt_prompt = (
        "이 음성은 한국어입니다. 내용을 정확히 받아 적으세요."
        "출력은 한국어(한글) 원문만."
        "일본어·영어·앞말·설명·따옴표·라벨은 넣지 마세요."
    )
    korean = _converse_audio(audio_bytes, audio_format, stt_prompt)
    logger.info("ko2ja stt_ko=%s", korean[:200])
    if not korean:
        return "", "", "", VOXTRAL_MODEL_ID

    translate_prompt = (
        "다음 한국어를 자연스러운 일본어로 번역하고, "
        "그 일본어를 한국인이 소리 내어 읽기 쉬운 한글 발음으로도 적으세요.\n"
        "한자·가나 병기 없이 일본어 문장과 한글 발음만.\n"
        "아래 두 줄 형식만 출력하세요 (앞말·따옴표·설명 금지).\n"
        "JA: <일본어 번역>\n"
        "발음: <한글 발음>\n\n"
        f"{korean}"
    )
    raw = _converse_text(translate_prompt, temperature=0.2)
    japanese, pronunciation = _parse_ja_and_pronunciation(raw)
    logger.info("ko2ja ja=%s pron=%s", japanese[:200], pronunciation[:200])
    return korean, japanese, pronunciation, VOXTRAL_MODEL_ID


def _handle_transcribe(event: Dict[str, Any]) -> Dict[str, Any]:
    try:
        payload = _parse_body(event)
    except json.JSONDecodeError:
        return _response(400, {"error": "Invalid JSON body"})

    audio_b64 = payload.get("audio") or payload.get("audioBase64") or ""
    if not audio_b64:
        return _response(400, {"error": "Missing audio (base64)"})

    try:
        audio_bytes = base64.b64decode(audio_b64, validate=False)
    except Exception:  # noqa: BLE001
        return _response(400, {"error": "Invalid base64 audio"})

    if not audio_bytes:
        return _response(400, {"error": "Empty audio"})
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        return _response(
            413,
            {
                "error": f"Audio too large (max {MAX_AUDIO_BYTES} bytes)",
                "size": len(audio_bytes),
            },
        )

    audio_format = payload.get("format") or payload.get("mimeType") or "wav"
    if "/" in str(audio_format):
        audio_format = str(audio_format).split("/")[-1]

    direction = str(payload.get("direction") or "ja2ko").strip().lower()
    if direction not in ("ja2ko", "ko2ja"):
        return _response(400, {"error": "direction must be ja2ko or ko2ja"})

    try:
        if direction == "ko2ja":
            korean, japanese, pronunciation, model_id = _speech_ko_then_ja(
                audio_bytes, str(audio_format)
            )
            return _response(
                200,
                {
                    "direction": "ko2ja",
                    "text": japanese,
                    "korean": korean,
                    "japanese": japanese,
                    "pronunciation": pronunciation,
                    "language": "ja",
                    "sourceLanguage": "ko",
                    "targetLanguage": "ja",
                    "modelId": model_id,
                    "bytes": len(audio_bytes),
                    "steps": ["stt_ko", "translate_ja_pron"],
                },
            )

        korean, model_id = _speech_to_korean(audio_bytes, str(audio_format))
        return _response(
            200,
            {
                "direction": "ja2ko",
                "text": korean,
                "korean": korean,
                "language": "ko",
                "sourceLanguage": "ja",
                "targetLanguage": "ko",
                "modelId": model_id,
                "bytes": len(audio_bytes),
                "steps": ["speech_to_ko"],
            },
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Transcription failed")
        return _response(
            502,
            {
                "error": "Transcription failed",
                "detail": str(exc),
                "modelId": VOXTRAL_MODEL_ID,
            },
        )


def _handle_speak(event: Dict[str, Any]) -> Dict[str, Any]:
    """Amazon Polly: Japanese text → MP3 audio."""
    try:
        payload = _parse_body(event)
    except json.JSONDecodeError:
        return _response(400, {"error": "Invalid JSON body"})

    text = _clean_model_text(str(payload.get("text") or ""))
    if not text:
        return _response(400, {"error": "Missing text"})
    if len(text) > MAX_SPEAK_CHARS:
        return _response(
            413,
            {"error": f"Text too long (max {MAX_SPEAK_CHARS} chars)"},
        )

    voice = str(payload.get("voice") or POLLY_VOICE_JA)
    engine = str(payload.get("engine") or POLLY_ENGINE)
    try:
        result = polly.synthesize_speech(
            Text=text,
            OutputFormat="mp3",
            VoiceId=voice,
            LanguageCode="ja-JP",
            Engine=engine,
        )
        audio_bytes = result["AudioStream"].read()
    except Exception as exc:  # noqa: BLE001
        # Fallback to standard engine if neural voice unavailable
        logger.warning("Polly neural failed (%s); retry standard", exc)
        try:
            result = polly.synthesize_speech(
                Text=text,
                OutputFormat="mp3",
                VoiceId="Takumi",
                LanguageCode="ja-JP",
                Engine="standard",
            )
            audio_bytes = result["AudioStream"].read()
            voice = "Takumi"
            engine = "standard"
        except Exception as exc2:  # noqa: BLE001
            logger.exception("Polly failed")
            return _response(502, {"error": "Polly failed", "detail": str(exc2)})

    return _response(
        200,
        {
            "audio": base64.b64encode(audio_bytes).decode("ascii"),
            "format": "mp3",
            "voice": voice,
            "engine": engine,
            "language": "ja-JP",
            "chars": len(text),
        },
    )


def lambda_handler(event, context):
    method = (
        (event.get("requestContext") or {}).get("http", {}).get("method")
        or event.get("httpMethod")
        or "GET"
    ).upper()
    path = event.get("rawPath") or event.get("path") or "/"

    if method == "OPTIONS":
        return _response(204, "")

    if path.endswith("/health") or path == "/health":
        return _response(
            200,
            {
                "status": "ok",
                "service": "travel-map",
                "region": os.environ.get("AWS_REGION", ""),
                "voxtralModelId": VOXTRAL_MODEL_ID,
                "pollyVoiceJa": POLLY_VOICE_JA,
            },
        )

    if path.endswith("/tours") or path == "/tours":
        try:
            return _response(200, _load_tours())
        except Exception as exc:  # noqa: BLE001
            return _response(500, {"error": str(exc)})

    if path.endswith("/transcribe") or path == "/transcribe":
        if method != "POST":
            return _response(405, {"error": "POST required"})
        return _handle_transcribe(event)

    if path.endswith("/speak") or path == "/speak":
        if method != "POST":
            return _response(405, {"error": "POST required"})
        return _handle_speak(event)

    return _response(404, {"error": "not found", "path": path})
