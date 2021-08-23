// Copyright 2018-2021 the Deno authors. All rights reserved. MIT license.
// A simple Router example with the following routes:
//   1. `/` - responds with status code 200.
//   2. `/admin/` - responds with status code 403.

import { listenAndServe } from "../native_server.ts";
import { Router } from "../router.ts";

const addr = "0.0.0.0:4506";

const router = new Router();

router.handle("/", () => new Response("Hello Deno!", { status: 200 }));
router.handle("/admin/", () => new Response("Restricted!", { status: 403 }));

console.log(`Simple server listening on http://${addr}`);

await listenAndServe(
  addr,
  (request, connInfo) => router.handler(request, connInfo),
);
