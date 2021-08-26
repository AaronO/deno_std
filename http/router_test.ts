import { Router } from "./router.ts";
import type { ConnInfo } from "./native_server.ts";
import { Status, STATUS_TEXT } from "./http_status.ts";
import { assertEquals, assertThrows } from "../testing/asserts.ts";

const mockConnInfo: ConnInfo = {
  localAddr: { hostname: "0.0.0.0", port: 4505, transport: "tcp" },
  remoteAddr: { hostname: "0.0.0.0", port: 4505, transport: "tcp" },
};

Deno.test("Router.handler should throw when passed an empty route", () => {
  const router = new Router();

  assertThrows(
    () => router.handle("", () => new Response()),
    Deno.errors.Http,
    "Invalid route",
  );
});

Deno.test("Router.handler should throw when passed a route that has already been registered", () => {
  const route = "/test/route";
  const router = new Router();
  router.handle(route, () => new Response());

  assertThrows(
    () => router.handle(route, () => new Response()),
    Deno.errors.Http,
    `Route ${route} already registered`,
  );
});

["/", "/path", "/path/"].forEach((path) => {
  Deno.test(`Router will fallback to a 404 response if there is no registered handler for a path route '${path}'`, async () => {
    const router = new Router();
    const request = new Request(`http://0.0.0.0:4505${path}?qs=test#hash`);
    const response = await router.handler(request, mockConnInfo);

    assertEquals(
      response,
      new Response(STATUS_TEXT.get(Status.NotFound), {
        headers: new Headers({
          "content-type": "text/plain; charset=utf-8",
          "x-content-type-options": "nosniff",
        }),
        status: Status.NotFound,
      }),
    );
  });

  Deno.test(`Router will fallback to a 404 response if there is no registered handler for a host + path route '0.0.0.1${path}'`, async () => {
    const router = new Router();
    router.handle(`0.0.0.1${path}`, () => new Response());

    const request = new Request(`http://0.0.0.0:4505${path}?qs=test#hash`);
    const response = await router.handler(request, mockConnInfo);

    assertEquals(
      response,
      new Response(STATUS_TEXT.get(Status.NotFound), {
        headers: new Headers({
          "content-type": "text/plain; charset=utf-8",
          "x-content-type-options": "nosniff",
        }),
        status: Status.NotFound,
      }),
    );
  });

  Deno.test(`Router will match on registered path route '${path}'`, async () => {
    const expectedResponse = new Response("test-response");
    const router = new Router();
    router.handle(path, () => expectedResponse);

    const request = new Request(`http://0.0.0.0:4505${path}?qs=test#hash`);
    const response = await router.handler(request, mockConnInfo);

    assertEquals(response, expectedResponse);
  });

  Deno.test(`Router will match on registered host + path route '0.0.0.1${path}'`, async () => {
    const expectedResponse = new Response("test-response");
    const router = new Router();
    router.handle(`0.0.0.1${path}`, () => expectedResponse);

    const request = new Request(`http://0.0.0.1:4505${path}?qs=test#hash`);
    const response = await router.handler(request, mockConnInfo);

    assertEquals(response, expectedResponse);
  });

  Deno.test(`Router will match on registered host header + path route '0.0.0.1${path}'`, async () => {
    const expectedResponse = new Response("test-response");
    const router = new Router();
    router.handle(`0.0.0.1${path}`, () => expectedResponse);

    const request = new Request(`http://0.0.0.1:4505${path}?qs=test#hash`, {
      headers: new Headers({ host: "0.0.0.1" }),
    });
    const response = await router.handler(request, mockConnInfo);

    assertEquals(response, expectedResponse);
  });
});

Deno.test("Router registered root path '/' matches all unmatched routes", () => {
  const expectedResponse = new Response("test-response");
  const router = new Router();
  router.handle("/", () => expectedResponse);

  [
    "/",
    "/path",
    "/path/",
  ].forEach(async (path) => {
    const request = new Request(`http://0.0.0.1:4505${path}?qs=test#hash`);
    const response = await router.handler(request, mockConnInfo);

    assertEquals(response, expectedResponse);
  });
});

Deno.test("Router registered root host + path '0.0.0.1/' matches all unmatched routes for the host '0.0.0.1'", () => {
  const expectedResponse = new Response("test-response");
  const router = new Router();
  router.handle("0.0.0.1/", () => expectedResponse);

  [
    "/",
    "/path",
    "/path/",
  ].forEach(async (path) => {
    const request = new Request(`http://0.0.0.1:4505${path}?qs=test#hash`);
    const response = await router.handler(request, mockConnInfo);

    assertEquals(response, expectedResponse);
  });

  [
    "/",
    "/path",
    "/path/",
  ].forEach(async (path) => {
    const request = new Request(`http://0.0.0.0:4505${path}?qs=test#hash`);
    const response = await router.handler(request, mockConnInfo);

    assertEquals(
      response,
      new Response(STATUS_TEXT.get(Status.NotFound), {
        headers: new Headers({
          "content-type": "text/plain; charset=utf-8",
          "x-content-type-options": "nosniff",
        }),
        status: Status.NotFound,
      }),
    );
  });
});

Deno.test("Router longer registered rooted subtrees take precedent over shorter rooted subtrees for matching path routes", () => {
  const expectedResponse = new Response("test-response");
  const router = new Router();
  router.handle("/", () => new Response());
  router.handle("/path/", () => new Response());
  router.handle("/path/longest/", () => expectedResponse);
  router.handle("/path/notrootedsubtree", () => new Response());

  ["/", "/path", "/path/"].forEach(async (path) => {
    const request = new Request(
      `http://0.0.0.0:4505/path/longest${path}?qs=test#hash`,
    );
    const response = await router.handler(request, mockConnInfo);

    assertEquals(response, expectedResponse);
  });
});

Deno.test("Router longer registered rooted subtrees take precedent over shorter rooted subtrees for matching host + path routes", () => {
  const expectedResponse = new Response("test-response");
  const router = new Router();
  router.handle("0.0.0.1/", () => new Response());
  router.handle("0.0.0.1/path/", () => new Response());
  router.handle("0.0.0.1/path/longest/", () => expectedResponse);
  router.handle("0.0.0.1/path/notrootedsubtree", () => new Response());
  router.handle("/", () => new Response());
  router.handle("/path/", () => new Response());
  router.handle("/path/longest/", () => new Response());
  router.handle("/path/notrootedsubtree", () => new Response());

  ["/", "/path", "/path/"].forEach(async (path) => {
    const request = new Request(
      `http://0.0.0.1:4505/path/longest${path}?qs=test#hash`,
    );
    const response = await router.handler(request, mockConnInfo);

    assertEquals(response, expectedResponse);
  });
});

Deno.test("Router paths without trailing slash with no matches that would match with a trailing slash are redirected to add the trailing slash", async () => {
  const url = "http://0.0.0.0:4505/path?qs=test#hash";

  const router = new Router();
  router.handle("/", () => new Response());
  router.handle("/path/", () => new Response());

  const request = new Request(url);
  const response = await router.handler(request, mockConnInfo);

  assertEquals(
    response,
    new Response(null, {
      headers: new Headers({
        location: "http://0.0.0.0:4505/path/?qs=test#hash",
      }),
      status: Status.MovedPermanently,
    }),
  );
});

Deno.test("Router non-normalized paths should be redirected to their normalized form", async () => {
  const urlBase = "http://0.0.0.0:4505/path/";

  const router = new Router();
  router.handle("/path/", () => new Response());

  const request = new Request(`${urlBase}../path//.?qs=test#hash`);
  const response = await router.handler(request, mockConnInfo);

  assertEquals(
    response,
    new Response(null, {
      headers: new Headers({ location: `${urlBase}?qs=test#hash` }),
      status: Status.MovedPermanently,
    }),
  );
});
