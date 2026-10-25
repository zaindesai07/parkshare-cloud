import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import crypto from 'crypto'

const AWS_REGION = process.env.AWS_REGION || 'ap-south-1'
const S3_BUCKET = process.env.AWS_S3_BUCKET || ''
export const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif']

let s3Client = null

export function isS3Configured() {
  return Boolean(
    S3_BUCKET &&
    (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI)
  )
}

function getClient() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: AWS_REGION,
    })
  }
  return s3Client
}

/**
 * Validate that an image key provided in space creation/update is safe and authorized.
 * Prevents arbitrary S3 object paths, directory traversal, and unauthorized object references.
 */
export function isValidSpaceImageKey(key, ownerId, isAdmin = false) {
  if (!key) return true

  // Allow standard unicode emojis (e.g. 🏢, 🅿️, 🚗, 🌴, 🏙️, 🏠)
  if (key.length <= 8 && !key.includes('/') && !key.includes('.')) {
    return true
  }

  // Scoped S3 object key validation
  if (isAdmin) {
    return /^spaces\/owner-\d+\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|avif)$/.test(key)
  }

  const safeRegex = new RegExp(`^spaces/owner-${ownerId}/[a-zA-Z0-9_-]+\\.(jpg|jpeg|png|webp|avif)$`)
  return safeRegex.test(key)
}

/**
 * Generate a presigned S3 PUT URL for uploading parking space photos.
 * Validates MIME type, file size limit (max 5MB), and scopes the object key to the owner.
 * If AWS credentials or bucket are not configured, returns a mock URL safe for local dev/testing.
 */
export async function generatePresignedUploadUrl({ filename, contentType, fileSize, ownerId }) {
  if (!ownerId) {
    throw new Error('Upload authorization required: ownerId must be specified.')
  }

  if (!ALLOWED_MIME_TYPES.includes(contentType)) {
    throw new Error(
      `Invalid file type '${contentType}'. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
    )
  }

  if (fileSize !== undefined && fileSize !== null) {
    const sizeNum = Number(fileSize)
    if (isNaN(sizeNum) || sizeNum <= 0) {
      throw new Error('Invalid file size.')
    }
    if (sizeNum > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds 5MB limit (${(sizeNum / (1024 * 1024)).toFixed(1)}MB).`)
    }
  }

  const rawExtension = (filename || '').split('.').pop()?.toLowerCase() || 'jpg'
  const safeExtension = ALLOWED_EXTENSIONS.includes(rawExtension) ? rawExtension : 'jpg'
  const uniqueKey = `spaces/owner-${ownerId}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${safeExtension}`

  if (!isS3Configured()) {
    // Graceful offline / local fallback: returns simulated key and URL
    return {
      uploadUrl: `https://${S3_BUCKET || 'parkshare-spaces-bucket'}.s3.${AWS_REGION}.amazonaws.com/${uniqueKey}?mock=true`,
      fileKey: uniqueKey,
      publicUrl: `https://${S3_BUCKET || 'parkshare-spaces-bucket'}.s3.${AWS_REGION}.amazonaws.com/${uniqueKey}`,
      isMock: true,
      expiresInSeconds: 300,
    }
  }

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: uniqueKey,
    ContentType: contentType,
  })

  const client = getClient()
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 })

  return {
    uploadUrl,
    fileKey: uniqueKey,
    publicUrl: `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${uniqueKey}`,
    isMock: false,
    expiresInSeconds: 300,
  }
}
