# kvs-simple

> A [kvs](https://github.com/taoyuan/kvs) simple storage adapter that supports
> input and output

## Install

```shell
npm i kvs kvs-simple
```

## Usage

### Using default FileIO

```js
import {Store} from 'kvs';
// import Simple from 'kvs-simple';

(async () => {
  const store = Store.create('simple' /* Simple */, {
    file: 'data.json',
    expiresCheckInterval: 24 * 3600 * 1000, // ms, check and remove expired data in each ms
    writeDelay: 100, // ms, batch write to disk in a specific duration, enhance write performance.
    codec: {
      encode: JSON.stringify, // serialize function
      decode: JSON.parse, // deserialize function
    },
  });

  const bucket = await store.bucket('namespace');

  bucket.set('key', 'value');
  const value = await bucket.get('key');
})();
```

### Using custom IO

```js
import fs from 'fs';
import {Store} from 'kvs';
// import Simple from 'kvs-simple';

(async () => {
  const store = Store.create('simple' /* Simple */, {
    expiresCheckInterval: 24 * 3600 * 1000, // ms, check and remove expired data in each ms
    writeDelay: 100, // ms, batch write to disk in a specific duration, enhance write performance.
    io: {
      read: async () => fs.readFileSync('data.json', 'utf8'),
      write: async data => fs.outputFile('data.json', data, 'utf8'),
    },
  });

  const bucket = await store.bucket('namespace');

  bucket.set('key', 'value');
  const value = await bucket.get('key');
})();
```

## License

MIT
