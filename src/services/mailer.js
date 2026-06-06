// services/mailer.js
// Replaces: mail(), mailhtml(), bulkmailhtml(), systememail() from EPIC::Common
//
// Perl used Email::Stuffer → SMTP directly.
// Node uses Nodemailer (npm install nodemailer) with the same SMTP approach.
// For production, swap the transport for SendGrid/Postmark by changing
// the createTransport config — the send functions don't change.

import nodemailer from 'nodemailer';  // npm install nodemailer
import { mail as mailConfig } from '../config.js';

const MAIL_TIMEOUT_MS = 5000; // fail fast in dev; production server should connect immediately

// Parses program.smtpserver — accepts either a plain hostname string (legacy)
// or a JSON object: { "host": "...", "port": 1234 }
export function parseSmtp(smtpserver) {
    if (!smtpserver) return {};
    try {
        const parsed = JSON.parse(smtpserver);
        return { host: parsed.host || undefined, port: parsed.port || undefined };
    } catch {
        return { host: smtpserver }; // plain string — legacy format
    }
}

function createTransport(host, port) {
    return nodemailer.createTransport({
        host: host || mailConfig.host,
        port: port || mailConfig.port,
        secure: false,
        tls:              { rejectUnauthorized: false },
        connectionTimeout: MAIL_TIMEOUT_MS,
        greetingTimeout:   MAIL_TIMEOUT_MS,
        socketTimeout:     MAIL_TIMEOUT_MS,
    });
}

// Replaces: systememail($msg)
// Sends a plain-text notification to the system admin address.
export async function systemEmail(msg) {
    const transport = createTransport();
    try {
        await transport.sendMail({
            from:    mailConfig.senderAddress,
            to:      mailConfig.systemAddress,
            subject: 'Important Notification from JADE Web App',
            text:    msg,
        });
    } catch (err) {
        console.error('systemEmail failed:', err.message);
        return `${mailConfig.systemAddress}: FAILED`;
    }
}

// Replaces: mail($email, $subject, $msg, $smtpserver, $senderaddress, $standardhtml, $filepath)
// Plain text email, optional file attachment.
export async function mail({ to, subject, text, from, smtpHost, smtpPort, attachmentPath } = {}) {
    const transport = createTransport(smtpHost, smtpPort);
    const message = {
        from:    from || mailConfig.senderAddress,
        to,
        subject,
        text,
    };
    if (attachmentPath) {
        message.attachments = [{ path: attachmentPath }];
    }
    try {
        await transport.sendMail(message);
    } catch (err) {
        console.error(`mail() to ${to} failed:`, err.message);
        return `${to}: FAILED`;
    }
}

// Replaces: mailhtml($email, $subject, $msg, $senderaddress, $smtpserver, ..., $cc, $bcc, $attachmentfilepath)
// HTML email with optional CC, BCC, and multiple attachments.
export async function mailHtml({
                                   to,           // string or array of strings
                                   subject,
                                   html,
                                   from,
                                   smtpHost,
                                   cc,           // string or array
                                   bcc,          // string or array
                                   attachments,  // array of file paths, equiv of $attachmentfilepath arrayref
                               } = {}) {
    const transport = createTransport(smtpHost);
    const message = {
        from:    from || mailConfig.senderAddress,
        to:      Array.isArray(to) ? to.join(', ') : to,
        subject,
        html,
    };
    if (cc)  message.cc  = Array.isArray(cc)  ? cc.join(', ')  : cc;
    if (bcc) message.bcc = Array.isArray(bcc) ? bcc.join(', ') : bcc;
    if (attachments && attachments.length) {
        message.attachments = attachments.map(p => ({ path: p }));
    }
    try {
        await transport.sendMail(message);
    } catch (err) {
        console.error(`mailHtml() to ${to} failed:`, err.message);
        return `${to}: FAILED`;
    }
}

// Replaces: bulkmailhtml($email, $subject, $msg, $senderaddress, $smtpserver)
// Thin wrapper — same as mailHtml but single recipient, no cc/bcc/attachments.
// Uses eblast SMTP host.
export async function bulkMailHtml({ to, subject, html, from } = {}) {
    return mailHtml({
        to,
        subject,
        html,
        from,
        smtpHost: mailConfig.eblastHost,
    });
}
