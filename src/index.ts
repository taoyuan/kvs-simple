import {Adapter} from 'kvs';
import os from 'os';
import fs from 'fs-extra';

const debug = require('debug')('kvs-file');

export interface Data<V> {
  expire?: number;
  value: V;
}

export interface Codec {
  encode(target: any): string;

  decode(target: any): any;
}

export const JsonCodec: Codec = {
  encode: target => JSON.stringify(target),
  decode: target => (typeof target === 'string' ? JSON.parse(target) : target),
};

export interface FileOptions {
  file: string;
  ttl: number | undefined;
  expiresCheckInterval: number;
  writeDelay: number;
  codec: Codec;
}

const DEFAULT_OPTIONS: FileOptions = {
  file: `${os.tmpdir()}/kvs/file-${Math.random().toString(36).slice(2)}.json`,
  ttl: undefined,
  expiresCheckInterval: 24 * 3600 * 1000,
  writeDelay: 100, // ms
  codec: JsonCodec,
};

function isNumber(x: any): x is number {
  return typeof x === 'number';
}

export default class File<V = any> implements Adapter {
  readonly name: string = 'file';

  public opts: FileOptions;
  public codec: Codec;
  public cache: Map<string, Data<V>>;
  public lastCheckAt: number;
  public saveTimer?: NodeJS.Timer;
  public savePromise?: Promise<any>;

  static create(opts?: FileOptions) {
    return new File(opts);
  }

  constructor(opts?: FileOptions) {
    this.opts = {
      ...DEFAULT_OPTIONS,
      ...opts,
    };

    this.codec = this.opts.codec;

    try {
      const data = this.codec.decode(fs.readFileSync(this.opts.file, 'utf8'));
      if (!Array.isArray(data.cache)) {
        data.cache = Object.entries(data.cache);
      }
      this.cache = new Map(data.cache);
      this.lastCheckAt = data.lastCheckAt ?? Date.now();
    } catch (e) {
      debug(e);
      this.cache = new Map();
      this.lastCheckAt = Date.now();
    }
  }

  isExpired(data: Data<V>) {
    return isNumber(data.expire) && data.expire <= Date.now();
  }

  async clear(pattern?: string): Promise<number> {
    const size = this.cache.size;
    this.cache = new Map();
    this.lastCheckAt = Date.now();
    // eslint-disable-next-line no-void
    void this.save();
    return size;
  }

  async close(): Promise<void> {
    // eslint-disable-next-line no-void
    void this.save();
  }

  async del(key: string): Promise<number> {
    const ret = this.cache.delete(key);
    // eslint-disable-next-line no-void
    void this.save();
    return ret ? 1 : 0;
  }

  async get(key: string): Promise<any> {
    try {
      const data = this.cache.get(key);
      if (!data) {
        return;
      }
      if (this.isExpired(data)) {
        await this.del(key);
      } else {
        return data.value;
      }
    } catch (error) {
      console.error(error);
    }
  }

  async getdel(key: string): Promise<any> {
    const value = await this.get(key);
    await this.del(key);
    return value;
  }

  async getset(key: string, value: any): Promise<any> {
    const old = await this.get(key);
    await this.set(key, value);
    return old;
  }

  async has(key: string): Promise<number> {
    return (await this.get(key)) !== undefined ? 1 : 0;
  }

  async keys(pattern?: string): Promise<string[]> {
    const keys = [] as string[];
    for (const key of this.cache.keys()) {
      if (!this.isExpired(this.cache.get(key)!)) {
        keys.push(key);
      }
    }
    return keys;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    if (!ttl) {
      ttl = this.opts.ttl;
    }
    this.cache.set(key, {
      value: value as any,
      expire: isNumber(ttl) ? Date.now() + ttl * 1000 : undefined,
    });
    // eslint-disable-next-line no-void
    void this.save();
  }

  clearExpiredItems() {
    const now = Date.now();
    if (now - this.lastCheckAt <= this.opts.expiresCheckInterval) {
      return;
    }
    for (const key of this.cache.keys()) {
      const data = this.cache.get(key);
      if (this.isExpired(data!)) {
        this.cache.delete(key);
      }
    }
    this.lastCheckAt = now;
  }

  async _save() {
    const cache = [] as [string, Data<V>][];
    for (const [key, val] of this.cache) {
      cache.push([key, val]);
    }
    return fs.outputFile(
      this.opts.file,
      this.codec.encode({
        cache,
        lastCheckAt: this.lastCheckAt,
      }),
      'utf8',
    );
  }

  async save() {
    this.clearExpiredItems();
    if (this.savePromise) {
      return this.savePromise;
    }
    return (this.savePromise = new Promise<any>((resolve, reject) => {
      this.saveTimer = setTimeout(() => {
        this._save()
          .then(() => {
            this.saveTimer = undefined;
            this.savePromise = undefined;
          })
          .then(resolve, reject);
      }, this.opts.writeDelay);
    }));
  }
}
