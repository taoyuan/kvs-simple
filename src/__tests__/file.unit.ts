import {expect} from '@tib/testlab';
import {random} from 'kvs-testlab';
import {Store} from 'kvs';
import delay from 'delay';
import fs from 'fs-extra';
import File from '..';

describe('kvs-file/file', function () {
  describe('creation', function () {
    it('should create with default options', function () {
      const store = Store.create(File);
      expect(store.adapter).instanceOf(File);
    });

    it('should create with custom options', function () {
      let store = Store.create(File);
      expect(store.adapter).instanceOf(File);
      let adapter = store.adapter as File;
      expect(adapter.opts.ttl).undefined();

      store = Store.create(File, {ttl: 1000});
      expect(store.adapter).instanceOf(File);
      adapter = store.adapter as File;
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
      const store = Store.create(File);
      const adapter = store.adapter as File;
      expect(fs.existsSync(adapter.opts.file)).false();

      const bucket = await store.bucket('test');
      await bucket.set(key, value);
      await delay(500);
      expect(fs.existsSync(adapter.opts.file)).true();
      fs.removeSync(adapter.opts.file);
    });

    it('should persist data', async function () {
      let store = Store.create(File);
      const adapter = store.adapter as File;
      const file = adapter.opts.file;
      let bucket = await store.bucket('test');
      await bucket.set(key, value);
      await delay(500);
      store = Store.create(File, {file});
      bucket = await store.bucket('test');
      const loaded = await bucket.get(key);
      expect(value).equal(loaded);
    });
  });
});
