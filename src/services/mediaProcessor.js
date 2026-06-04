// services/mediaProcessor.js
// Post-upload media processing — mirrors the Perl ImageMagick + ffmpeg pipeline.
//
// Images: Sharp resizes to max 800px wide, JPEG quality 80 → convertedImageStore/
// Videos: ffmpeg converts to h264/aac mp4                  → convertedVideoStore/
//
// Both run asynchronously (called after the HTTP response is sent) so the user
// isn't blocked waiting for conversion.

import sharp     from 'sharp';
import ffmpeg    from 'fluent-ffmpeg';
import path      from 'path';
import fs        from 'fs/promises';

// ── Directory constants (mirrors formResponses.js — read from env) ────────────
const FILESTORE_ROOT       = process.env.FILESTORE_ROOT || 'C:/Data/LocalJadeFilestore';
const ORIGINAL_IMAGES_DIR  = path.join(FILESTORE_ROOT, 'originalImages');
const CONVERTED_IMAGES_DIR = path.join(FILESTORE_ROOT, 'convertedImageStore');
const ORIGINAL_VIDEOS_DIR  = path.join(FILESTORE_ROOT, 'originalVideos');
const CONVERTED_VIDEOS_DIR = path.join(FILESTORE_ROOT, 'convertedVideoStore');

// Allow overriding the ffmpeg binary path via env (useful on Windows where it
// may not be on PATH — set FFMPEG_PATH=C:/tools/ffmpeg/bin/ffmpeg.exe in .env)
if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);

// ── Image processing ──────────────────────────────────────────────────────────

export async function processImage(filename) {
    const base = path.parse(filename).name; // strip extension
    // Perl uploads have no extension on disk; Node uploads do — try both
    let src = path.join(ORIGINAL_IMAGES_DIR, filename);
    try { await fs.access(src); } catch {
        src = path.join(ORIGINAL_IMAGES_DIR, base); // legacy no-extension file
    }
    // Always store as .jpg in convertedImageStore regardless of original extension
    const dest = path.join(CONVERTED_IMAGES_DIR, base + '.jpg');

    try {
        await fs.mkdir(CONVERTED_IMAGES_DIR, { recursive: true });
        await sharp(src)
            .resize({ width: 800, withoutEnlargement: true })
            .jpeg({ quality: 80 })
            .toFile(dest);
        console.log(`[media] image converted: ${filename}`);
    } catch (err) {
        console.error(`[media] image conversion failed for ${filename}:`, err.message);
    }
}

// ── Video processing ──────────────────────────────────────────────────────────

export function processVideo(filename) {
    const base     = path.parse(filename).name;
    const destName = base + '.mp4';
    const dest     = path.join(CONVERTED_VIDEOS_DIR, destName);

    // Resolve source — Node uploads have extension, Perl uploads don't
    const srcWithExt    = path.join(ORIGINAL_VIDEOS_DIR, filename);
    const srcWithoutExt = path.join(ORIGINAL_VIDEOS_DIR, base);

    fs.mkdir(CONVERTED_VIDEOS_DIR, { recursive: true })
        .then(() => fs.access(srcWithExt).then(() => srcWithExt).catch(() => srcWithoutExt))
        .then(src => new Promise((resolve, reject) => {
            ffmpeg(src)
                .videoCodec('libx264')
                .audioCodec('aac')
                .outputOptions([
                    '-crf 23',          // quality — lower = better, 23 is a good default
                    '-preset fast',     // encoding speed vs compression trade-off
                    '-movflags +faststart', // web-optimised: moov atom at front
                    '-vf scale=\'min(1280,iw):-2\'', // cap at 1280px wide, keep aspect
                ])
                .output(dest)
                .on('start',    (cmd) => console.log(`[media] ffmpeg started: ${filename}`))
                .on('progress', (p)   => { if (p.percent) process.stdout.write(`\r[media] ${filename} ${Math.round(p.percent)}%`); })
                .on('end',      ()    => { process.stdout.write('\n'); console.log(`[media] video converted: ${filename}`); resolve(); })
                .on('error',    (err) => { console.error(`[media] video conversion failed for ${filename}:`, err.message); reject(err); })
                .run();
        }))
        .catch(err => console.error(`[media] processVideo error:`, err.message));
}
