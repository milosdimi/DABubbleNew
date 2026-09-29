import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const URL_SECONDS = 60;

function createClient(endpoint, s3) {
  return new S3Client({
    endpoint,
    region: s3.region,
    forcePathStyle: true,
    credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
  });
}

/**
 * Zugriff auf den Bucket. Signiert wird immer mit dem OEFFENTLICHEN Endpoint,
 * weil der Host Teil der Signatur ist. Fuer die Existenzpruefung kann ein
 * interner Endpoint (Docker-Netz) genutzt werden.
 */
class Storage {
  constructor(s3) {
    this.bucket = s3.bucket;
    this.publicClient = createClient(s3.publicEndpoint, s3);
    this.internalClient = s3.internalEndpoint ? createClient(s3.internalEndpoint, s3) : this.publicClient;
  }

  /** PUT-URL; Content-Type und -Length sind mitsigniert und muessen exakt passen. */
  uploadUrl(key, contentType, size) {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: size });
    const signableHeaders = new Set(['content-type', 'content-length']);
    return getSignedUrl(this.publicClient, command, { expiresIn: URL_SECONDS, signableHeaders });
  }

  /** GET-URL; der Browser zeigt die Datei unter ihrem Anzeigenamen. */
  downloadUrl(key, fileName) {
    const disposition = `inline; filename="${fileName}"`;
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key, ResponseContentDisposition: disposition });
    return getSignedUrl(this.publicClient, command, { expiresIn: URL_SECONDS });
  }

  /** `false`, wenn es das Objekt nicht (mehr) gibt. */
  async exists(key) {
    try {
      await this.internalClient.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (error?.$metadata?.httpStatusCode === 404) return false;
      throw error;
    }
  }
}

export function createStorage(s3) {
  return new Storage(s3);
}
