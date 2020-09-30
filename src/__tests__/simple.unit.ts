import {expect} from '@tib/testlab';
import {random} from 'kvs-testlab';
import {Store} from 'kvs';
import delay from 'delay';
import os from 'os';
import fs from 'fs-extra';
import tk from 'timekeeper';
import Simple from '..';

const sec = 1000;
const minute = 60 * sec;
const hour = 60 * minute;
const day = 24 * hour;

describe('kvs-simple/file', function () {
  describe('creation', function () {
    it('should create with default options', function () {
      const store = Store.create(Simple);
      expect(store.adapter).instanceOf(Simple);
    });

    it('should create with custom options', function () {
      let store = Store.create(Simple);
      expect(store.adapter).instanceOf(Simple);
      let adapter = store.adapter as Simple;
      expect(adapter.opts.ttl).undefined();

      store = Store.create(Simple, {ttl: 1000});
      expect(store.adapter).instanceOf(Simple);
      adapter = store.adapter as Simple;
      expect(adapter.opts.ttl).equal(1000);
    });
  });

  describe('save', function () {
    let key: string;
    let value: string;

    beforeEach(() => {
      key = random.string(10);
      value = random.string(10);
    });

    it('should save with delay', async function () {
      const store = Store.create(Simple);
      const adapter = store.adapter as Simple;
      expect(fs.existsSync(adapter.opts.file)).false();

      const bucket = await store.bucket('test');
      await bucket.set(key, value);
      await delay(500);
      expect(fs.existsSync(adapter.opts.file)).true();
      fs.removeSync(adapter.opts.file);
    });

    it('should persist data', async function () {
      let store = Store.create(Simple);
      const adapter = store.adapter as Simple;
      const file = adapter.opts.file;
      let bucket = await store.bucket('test');
      await bucket.set(key, value);
      await delay(500);
      store = Store.create(Simple, {file});
      bucket = await store.bucket('test');
      const loaded = await bucket.get(key);
      expect(value).equal(loaded);
    });
  });

  describe('clearExpiredItems', function () {
    it('should save and clearExpiredItems', async function () {
      const options = {
        file: `${os.tmpdir()}/kvs/${Math.random().toString(36).slice(2)}.json`,
        expiresCheckInterval: 24 * 3600 * 1000,
        writeDelay: 100, // ms
      };

      const store = new Store(Simple, options);
      const bucket = await store.bucket('test');
      await bucket.set('foo1', 'bar', 3);
      await bucket.set('foo2', 'bar');

      expect(await bucket.get('foo1')).ok();
      expect(await bucket.get('foo2')).ok();
      expect(await bucket.keys()).deepEqual(['foo1', 'foo2']);
      await (store.adapter as Simple).write();

      const store3 = new Store(Simple, options);
      const bucket3 = await store3.bucket('test');
      tk.travel(new Date(Date.now() + sec));
      expect(await bucket3.get('foo1')).equal('bar');
      expect(await bucket3.keys()).deepEqual(['foo1', 'foo2']);

      tk.travel(new Date(Date.now() + 3 * sec));
      expect(await bucket3.get('foo1')).undefined();
      expect(await bucket3.get('foo2')).equal('bar');
      expect(await bucket3.keys()).deepEqual(['foo2']);

      await bucket3.set('foo3', 'bar', (5 * hour) / 1000);
      expect(await bucket3.get('foo3')).equal('bar');
      tk.travel(new Date(Date.now() + day + hour));
      expect(await bucket3.has('foo3')).equal(0);
      expect(await bucket3.get('foo3')).undefined();
    });
  });
});
