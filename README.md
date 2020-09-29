# kvs-file

> File storage adapter for KVS

## Install

```shell
npm i kvs kvs-file
```

## Usage

```js
import {Store} from 'kvs';
import File from 'kvs-file';

(async () => {
  const store = Store.create('file' /* File */, {
    file: 'data.json',
    expiresCheckInterval: 24 * 3600 * 1000, // ms, check and remove expired data in each ms
    writeDelay: 100, // ms, batch write to disk in a specific duration, enhance write performance.
    codec: {
      encode: JSON.stringify, // serialize function
      decode: JSON.parse // deserialize function
    }
  });

  const bucket = await store.bucket('namespace');

  bucket.set('key', 'value');
  const value = await bucket.get('key');
})();
```

## License

MIT
