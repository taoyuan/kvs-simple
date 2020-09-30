import os from 'os';
import fs from 'fs-extra';
import {Adapter} from 'kvs';
import micromatch from 'micromatch';

const debug = require('debug')('kvs-simple');

export interface Data<V> {
  expire?: number;
  value: V;
}

export interface Codec {
  encode(target: any): string;

  decode(target: any): any;
}

export interface IO {
  read(): Promise<any>;

  write(data: any): Promise<any>;
}

export class JsonCodec implements Codec {
  encode(target: any) {
    return JSON.stringify(target);
  }

  decode(target: any) {
    return typeof target === 'string' ? JSON.parse(target) : target;
  }
}

export class SimpleFileIO implements IO {
  constructor(public readonly file: string) {}

  read(): Promise<any> {
    return fs.readFile(this.file, 'utf8');
  }

  write(data: any): Promise<any> {
    return fs.outputFile(this.file, data, 'utf8');
  }
}

export interface FileOptions {
  io?: IO;
  ttl?: number;
  file: string;
  expiresCheckInterval: number;
  writeDelay: number;
  codec: Codec;
}

const DEFAULT_OPTIONS: FileOptions = {
  file: `${os.tmpdir()}/kvs/${Math.random().toString(36).slice(2)}.json`,
  expiresCheckInterval: 24 * 3600 * 1000,
  writeDelay: 100, // ms
  codec: new JsonCodec(),
};

function isNumber(x: any): x is number {
  return typeof x === 'number';
}

export default class Simple<V = any> implements Adapter {
  readonly name: string = 'file';

  ready: Promise<void>;

  public opts: FileOptions;
  public codec: Codec;
  public io: IO;
  public cache: Map<string, Data<V>>;
  public lastCheckAt: number;
  public saveTimer?: NodeJS.Timer;
  public savePromise?: Promise<any>;

  constructor(opts?: Partial<FileOptions>) {
    this.opts = {
      ...DEFAULT_OPTIONS,
      ...opts,
    };
    this.io = this.opts.io ?? new SimpleFileIO(this.opts.file);
    this.codec = this.opts.codec;
    this.ready = this.init();
  }

  protected async init() {
    try {
      const data = this.codec.decode(await this.io.read());
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
    await this.ready;
    pattern = pattern ?? '*';
    let count = 0;
    if (pattern === '*') {
      count = this.cache.size;
      this.cache = new Map();
    } else
      for (const key of await this.keys(pattern)) {
        count += await this.del(key);
      }

    this.lastCheckAt = Date.now();
    // eslint-disable-next-line no-void
    void this.save();
    return count;
  }

  async close(): Promise<void> {
    await this.ready;
    // eslint-disable-next-line no-void
    void this.save();
  }

  async del(key: string): Promise<number> {
    await this.ready;
    const ret = this.cache.delete(key);
    // eslint-disable-next-line no-void
    void this.save();
    return ret ? 1 : 0;
  }

  async get(key: string): Promise<any> {
    await this.ready;
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
    await this.ready;
    const value = await this.get(key);
    await this.del(key);
    return value;
  }

  async getset(key: string, value: any): Promise<any> {
    await this.ready;
    const old = await this.get(key);
    await this.set(key, value);
    return old;
  }

  async has(key: string): Promise<number> {
    await this.ready;
    return (await this.get(key)) !== undefined ? 1 : 0;
  }

  async keys(pattern?: string): Promise<string[]> {
    await this.ready;
    pattern = pattern ?? '*';
    const keys = [] as string[];
    for (const key of this.cache.keys()) {
      if (
        !this.isExpired(this.cache.get(key)!) &&
        (micromatch.isMatch(key, pattern) || pattern === '*')
      ) {
        keys.push(key);
      }
    }
    return keys;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    await this.ready;
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

  async clearExpiredItems() {
    await this.ready;
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

  async write() {
    const cache = [] as [string, Data<V>][];
    for (const [key, val] of this.cache) {
      cache.push([key, val]);
    }
    return this.io.write(
      this.codec.encode({
        cache,
        lastCheckAt: this.lastCheckAt,
      }),
    );
  }

  async save() {
    await this.ready;
    await this.clearExpiredItems();
    if (this.savePromise) {
      return this.savePromise;
    }
    return (this.savePromise = new Promise<any>((resolve, reject) => {
      this.saveTimer = setTimeout(() => {
        this.write()
          .then(() => {
            this.saveTimer = undefined;
            this.savePromise = undefined;
          })
          .then(resolve, reject);
      }, this.opts.writeDelay);
    }));
  }
}
