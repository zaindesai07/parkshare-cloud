import { SNSClient, PublishCommand } from '@aws-sdk/client-sns'

const AWS_REGION = process.env.AWS_REGION || 'ap-south-1'
const SNS_TOPIC_ARN = process.env.AWS_SNS_TOPIC_ARN || ''

let snsClient = null

export function isSnsConfigured() {
  if (process.env.NODE_ENV === 'test') {
    return false // Force mock in test environments to prevent external network calls
  }
  return Boolean(
    SNS_TOPIC_ARN &&
    (process.env.AWS_ACCESS_KEY_ID ||
      process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI ||
      process.env.AWS_IAM_ROLE === 'true' ||
      process.env.NODE_ENV === 'production')
  )
}

function getClient() {
  if (!snsClient) {
    snsClient = new SNSClient({
      region: AWS_REGION,
    })
  }
  return snsClient
}

/**
 * Send reservation confirmation alert via AWS SNS.
 * Falls back to structured log in local/dev/test environments.
 */
export async function sendBookingAlert(booking) {
  const message = `[ParkShare Cloud] Reservation Confirmed! Booking #${booking.id} for "${booking.space_title || 'Parking Space'}" starting at ${new Date(booking.start_time).toLocaleString()}. Total: ₹${booking.total_price}.`

  if (!isSnsConfigured()) {
    console.log(`[SNS Alert (Dev/Offline)] ${message}`)
    return {
      sent: false,
      isMock: true,
      message,
    }
  }

  try {
    const client = getClient()
    const command = new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Subject: `ParkShare Booking #${booking.id} Confirmed`,
      Message: message,
    })

    const response = await client.send(command)
    return {
      sent: true,
      messageId: response.MessageId,
      isMock: false,
    }
  } catch (error) {
    console.warn(`[SNS Warning] Failed to publish booking confirmation: ${error.message}`)
    return {
      sent: false,
      error: error.message,
      isMock: false,
    }
  }
}

/**
 * Send reservation cancellation alert via AWS SNS.
 * Falls back to structured log in local/dev/test environments.
 */
export async function sendCancellationAlert(booking) {
  const message = `[ParkShare Cloud] Reservation Cancelled: Booking #${booking.id} for "${booking.space_title || 'Parking Space'}" starting at ${new Date(booking.start_time).toLocaleString()} has been cancelled.`

  if (!isSnsConfigured()) {
    console.log(`[SNS Alert (Dev/Offline)] ${message}`)
    return {
      sent: false,
      isMock: true,
      message,
    }
  }

  try {
    const client = getClient()
    const command = new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Subject: `ParkShare Booking #${booking.id} Cancelled`,
      Message: message,
    })

    const response = await client.send(command)
    return {
      sent: true,
      messageId: response.MessageId,
      isMock: false,
    }
  } catch (error) {
    console.warn(`[SNS Warning] Failed to publish booking cancellation: ${error.message}`)
    return {
      sent: false,
      error: error.message,
      isMock: false,
    }
  }
}

/**
 * Safe, retry-safe background dispatcher for notifications.
 * Ensures notification failures NEVER disrupt core database transactions.
 */
export function safeDispatchNotification(notifyFn) {
  Promise.resolve()
    .then(notifyFn)
    .catch((err) => {
      console.warn(`[SNS Background Notification Error] ${err.message}`)
    })
}
