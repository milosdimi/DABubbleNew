/** Liest die Konfiguration aus Umgebungsvariablen (siehe .env.example). */

const MB = 1024 * 1024;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Umgebungsvariable ${name} fehlt.`);
  return value;
}

function optional(name, fallback) {
  return process.env[name]?.trim() || fallback;
}

function list(name, fallback) {
  return optional(name, fallback)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function loadConfig() {
  return {
    port: Number(optional('PORT', '3000')),
    firebaseProjectId: optional('FIREBASE_PROJECT_ID', 'dababble'),
    allowedOrigins: list('ALLOWED_ORIGINS', 'https://dabubble.dimit.cc,http://localhost:4200'),
    maxUploadBytes: Number(optional('MAX_UPLOAD_BYTES', String(10 * MB))),
    uploadsPerHour: Number(optional('UPLOADS_PER_HOUR', '20')),
    s3: loadS3Config(),
  };
}

function loadS3Config() {
  return {
    publicEndpoint: required('S3_PUBLIC_ENDPOINT'),
    internalEndpoint: optional('S3_INTERNAL_ENDPOINT', ''),
    region: optional('S3_REGION', 'us-east-1'),
    bucket: required('S3_BUCKET'),
    accessKeyId: required('S3_ACCESS_KEY'),
    secretAccessKey: required('S3_SECRET_KEY'),
  };
}
