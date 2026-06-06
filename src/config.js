// config.js
// Replaces all the environment/path detection functions from EPIC::Common:
//   servername(), get_db_host(), get_mail_server(), docroot(), scriptroot() etc.
//
// In Perl these sniffed $ENV{HTTP_HOST} at runtime to decide dev vs prod.
// In Node we use NODE_ENV + .env — clean, explicit, and testable.

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

// ── Server ───────────────────────────────────────────────────────────────────
// Replaces: servername(), server(), secureport()
export const server = {
    host:     process.env.HOST     || 'localhost',
    port:     process.env.PORT     || 3000,
    baseUrl:  process.env.BASE_URL || 'http://localhost:3000',
    isSecure: isProd,
};

// ── Database ─────────────────────────────────────────────────────────────────
// Replaces: get_db_host() — which sniffed HTTP_HOST to pick dev vs prod SQL server
export const db = {
    host:     process.env.DB_HOST     || '127.0.0.1',
    name:     process.env.DB_NAME     || 'Jade',
    user:     process.env.DB_USER     || 'indigo',
    password: process.env.DB_PASS     || 'simpson',
};

// ── Mail ─────────────────────────────────────────────────────────────────────
// Replaces: get_mail_server(), get_eblast_mail_server()
export const mail = {
    host:          process.env.MAIL_HOST || null,
    port:          process.env.MAIL_PORT ? parseInt(process.env.MAIL_PORT) : 25,
    eblastHost:    process.env.EBLAST_MAIL_HOST || '192.168.50.4',
    systemAddress: process.env.SYSTEM_EMAIL     || 'website.notifications@epicteam.com.au',
    senderAddress: process.env.SENDER_EMAIL     || 'Web.Servers@epicteam.com.au',
};

// ── File storage ─────────────────────────────────────────────────────────────
// Replaces: get_network_filestore_root(), htmlfilepath(), pdffilepath() etc.
// The Perl version used UNC paths (\\nas\...) on Windows.
// Map these to env vars so the same code works dev and prod.
const nasRoot = process.env.FILESTORE_ROOT
    || (isProd ? '\\\\nas.internal.epicteam.com.au\\JadeFileStore$' : 'D:/WebProjects/JadeFileStore');

export const filestore = {
    root:                nasRoot,
    html:                `${nasRoot}/html`,
    pdf:                 `${nasRoot}/pdf`,
    logs:                `${nasRoot}/logs`,
    originalImages:      `${nasRoot}/originalImages`,
    originalVideos:      `${nasRoot}/originalVideos`,
    originalFiles:       `${nasRoot}/originalFiles`,
    conversionTmpImages: `${nasRoot}/conversionTmpImages`,
    convertedImages:     `${nasRoot}/convertedImageStore`,
    conversionTmpVideo:  `${nasRoot}/conversionTmpVideo`,
    convertedVideos:     `${nasRoot}/convertedVideoStore`,
};

// Content server — replaces contentServerWANAccessFiles() etc.
export const contentServer = {
    // Where the dedicated image/video server maps the NAS
    mappedNas:    process.env.CONTENT_SERVER_NAS   || '/opt/jade/remotestore',
    // Public-facing URLs for files/images/videos
    filesUrl:     process.env.CONTENT_FILES_URL    || (isProd
        ? 'https://jadestore.shadedsolutions.com.au/uploadfiles'
        : '../uploadfiles'),
    videosUrl:    process.env.CONTENT_VIDEOS_URL   || (isProd
        ? 'https://jadestore.shadedsolutions.com.au/uploadvideos'
        : '../uploadvideos'),
    // Script endpoint on the content server (used for symlink creation)
    scriptUrl:    'http://webfilestore.epicteam.com.au/cgi-bin',
};

// ── External tools ───────────────────────────────────────────────────────────
// Replaces: path_to_ffmpeg(), path_to_imagemagick(), path_to_qtfaststart()
// These are only needed if you keep server-side video/image processing.
export const tools = {
    ffmpeg:       process.env.FFMPEG_PATH      || 'ffmpeg',        // assumes in PATH on Linux
    imagemagick:  process.env.IMAGEMAGICK_PATH || 'convert',
    qtfaststart:  process.env.QTFASTSTART_PATH || 'qt-faststart',
};
