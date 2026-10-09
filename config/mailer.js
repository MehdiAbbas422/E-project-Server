const nodemailer = require('nodemailer')

let transporter

const getTransporter = async () => {
  if (transporter) return transporter
  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    })
  } else {
    const test = await nodemailer.createTestAccount()
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: test.user, pass: test.pass }
    })
    console.log('No SMTP config — using Ethereal test account')
  }
  return transporter
}

// Purpose: Generic email sender used for notifications (approval, reply, ...).
const sendMail = async ({ to, subject, html }) => {
  const activeTransporter = await getTransporter()
  const info = await activeTransporter.sendMail({
    from: process.env.SMTP_FROM || 'EventSphere <no-reply@eventsphere.com>',
    to,
    subject,
    html
  })
  const preview = nodemailer.getTestMessageUrl(info)
  if (preview) console.log('Email preview (Ethereal):', preview)
  return info
}

// Purpose: Emails a 6-digit one-time code for account verification or
// password reset. Falls back to an Ethereal test inbox when SMTP is not set.
const sendOtp = async (email, code, purpose) => {
  try {
    const subject = purpose === 'verify' ? 'Verify your EventSphere account' : 'Reset your EventSphere password'
    const info = await sendMail({
      to: email,
      subject,
      html: `<p>Your EventSphere verification code is:</p><h2 style="color:#4f46e5">${code}</h2><p>It expires in 10 minutes.</p>`
    })
    console.log(`OTP sent to ${email} for ${purpose}: ${code}`)
    return info
  } catch (e) {
    console.error(`Failed to send OTP to ${email} for ${purpose}:`, e)
    throw e
  }
}

module.exports = sendOtp
module.exports.sendMail = sendMail
