// deno-fmt-ignore-file
// deno-lint-ignore-file

// Copyright Joyent and Node contributors. All rights reserved. MIT license.
// Taken from Node 18.12.0
// This file is automatically generated by "node/_tools/setup.ts". Do not modify this file manually

'use strict';
require('../common');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const tmpdir = require('../common/tmpdir');

const example = path.join(tmpdir.path, 'dummy');

tmpdir.refresh();
// Should not throw.
fs.createWriteStream(example, undefined).end();
fs.createWriteStream(example, null).end();
fs.createWriteStream(example, 'utf8').end();
fs.createWriteStream(example, { encoding: 'utf8' }).end();

const createWriteStreamErr = (path, opt) => {
  assert.throws(
    () => {
      fs.createWriteStream(path, opt);
    },
    {
      code: 'ERR_INVALID_ARG_TYPE',
      name: 'TypeError'
    });
};

createWriteStreamErr(example, 123);
createWriteStreamErr(example, 0);
createWriteStreamErr(example, true);
createWriteStreamErr(example, false);
