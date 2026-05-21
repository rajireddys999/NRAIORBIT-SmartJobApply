import boto3
from botocore.exceptions import ClientError
from fastapi import UploadFile

from backend.config import settings

_s3 = boto3.client(
    "s3",
    aws_access_key_id=settings.aws_access_key_id,
    aws_secret_access_key=settings.aws_secret_access_key,
    region_name=settings.aws_region,
)


def upload_resume(file: UploadFile, user_id: str) -> str:
    key = f"resumes/{user_id}/{file.filename}"
    _s3.upload_fileobj(file.file, settings.s3_bucket_name, key, ExtraArgs={"ContentType": "application/pdf"})
    return f"https://{settings.s3_bucket_name}.s3.{settings.aws_region}.amazonaws.com/{key}"


def get_presigned_url(s3_url: str, expires: int = 3600) -> str:
    key = s3_url.split(".amazonaws.com/", 1)[-1]
    return _s3.generate_presigned_url("get_object", Params={"Bucket": settings.s3_bucket_name, "Key": key}, ExpiresIn=expires)
