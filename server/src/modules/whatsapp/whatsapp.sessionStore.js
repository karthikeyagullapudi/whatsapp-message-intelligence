import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import mongoose from 'mongoose';

// Remote session store for whatsapp-web.js RemoteAuth.
//
// RemoteAuth zips the Chromium profile (the "linked device" login) and asks the
// store to save/restore it. We keep the zip in MongoDB GridFS, so the login
// survives restarts and lives in the same database as everything else.
//
// Why not the `wwebjs-mongo` package: in whatsapp-web.js 1.34 RemoteAuth writes
// the zip into its dataPath, but wwebjs-mongo reads it from the current working
// directory, so the backup fails. It also does not await deletes. This class is
// the same idea with those two bugs fixed.
export class MongoSessionStore {
  constructor({ dataPath, connection = mongoose.connection }) {
    this.dataPath = dataPath;
    this.connection = connection;
  }

  #bucket(session) {
    return new mongoose.mongo.GridFSBucket(this.connection.db, { bucketName: `whatsapp-${session}` });
  }

  #zipName(session) {
    return `${session}.zip`;
  }

  async sessionExists({ session }) {
    const count = await this.connection.db.collection(`whatsapp-${session}.files`).countDocuments();
    return count > 0;
  }

  async save({ session }) {
    const bucket = this.#bucket(session);
    const name = this.#zipName(session);
    await pipeline(
      fs.createReadStream(path.join(this.dataPath, name)),
      bucket.openUploadStream(name),
    );
    // Keep only the newest backup.
    const files = await bucket.find({ filename: name }).sort({ uploadDate: -1 }).toArray();
    await Promise.all(files.slice(1).map((f) => bucket.delete(f._id)));
  }

  // When the newest backup was uploaded (null if there is none). Used to show
  // "session saved" after a restart: RemoteAuth only announces the first save.
  async lastSavedAt({ session }) {
    const [newest] = await this.#bucket(session)
      .find({ filename: this.#zipName(session) })
      .sort({ uploadDate: -1 })
      .limit(1)
      .toArray();
    return newest?.uploadDate ?? null;
  }

  async extract({ session, path: destination }) {
    // By default GridFS returns the newest revision with this name.
    await pipeline(
      this.#bucket(session).openDownloadStreamByName(this.#zipName(session)),
      fs.createWriteStream(destination),
    );
  }

  async delete({ session }) {
    const bucket = this.#bucket(session);
    const files = await bucket.find({ filename: this.#zipName(session) }).toArray();
    await Promise.all(files.map((f) => bucket.delete(f._id)));
  }
}
