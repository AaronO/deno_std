// deno-fmt-ignore-file
// deno-lint-ignore-file

// Copyright Joyent and Node contributors. All rights reserved. MIT license.
// Taken from Node 18.12.0
// This file is automatically generated by "node/_tools/setup.ts". Do not modify this file manually

'use strict';
const common = require('../common');
const { Transform } = require('stream');
const stream = new Transform({
  transform(chunk, enc, cb) { cb(); cb(); }
});

stream.on('error', common.expectsError({
  name: 'Error',
  message: 'Callback called multiple times',
  code: 'ERR_MULTIPLE_CALLBACK'
}));

stream.write('foo');
