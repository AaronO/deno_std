// Copyright 2018-2021 the Deno authors. All rights reserved. MIT license.
import { ConnInfo, Handler } from "./native_server.ts";
import { normalize } from "../path/posix.ts";
import { Status, STATUS_TEXT } from "./http_status.ts";

/**
 * Thrown when providing an invalid route string to the Router.handle method.
 */
const ERROR_INVALID_ROUTE = new Deno.errors.Http("Invalid route");

/**
 * Retrieves the Hostname (Host without Port). For HTTP/1 (RFC 7230, section
 * 5.4), this is either the value of the "Host" header or the host name given
 * in the URL itself. For HTTP/2, it is the value of the ":authority" pseudo-
 * header field.
 *
 * @param {Headers} headers The request headers.
 * @param {URL} url The request url.
 * @param {string} url.protocol The request protocol.
 * @param {string} url.hostname The request hostname (request host without port).
 * @returns {string} The hostname (host without port).
 * @private
 */
function _getHostname(headers: Headers, url: URL): string {
  // TODO: for HTTP/2 use the ":authority" pseudo-header.
  const hostHeader = headers.get("host");

  return hostHeader ? new URL(`proto://${hostHeader}`).hostname : url.hostname;
}

/**
 * Constructs a "Redirect" handler for the provided destination url and status.
 *
 * @param {URL} url The request URL.
 * @param {Status} status The redirect status code.
 * @returns {Handler} A "Redirect" handler.
 * @private
 */
function _redirectHandler(url: URL, status: Status): Handler {
  return function _redirect(): Response {
    const headers = new Headers({ location: url.toString() });

    return new Response(null, { status, headers });
  };
}

/**
 * Constructs a "Not Found" handler which will response with a 404 "Not Found"
 * response and status code.
 *
 * @returns {Handler} A "Not Found" handler.
 * @private
 */
function _notFoundHandler(): Handler {
  const status = Status.NotFound;
  const statusText = STATUS_TEXT.get(status);
  const headers = new Headers({
    "content-type": "text/plain; charset=utf-8",
    "x-content-type-options": "nosniff",
  });

  return function _notFound(): Response {
    return new Response(statusText, { headers, status });
  };
}

/**
 * Router is a HTTP request router.
 *
 * It matches the URL of each incoming request against a map of registered
 * routes and executes the associated handler.
 *
 * Routes can be fixed, rooted paths (e.g. `"/index.html"`) or rooted subtrees
 * (e.g. `"/public/"`). Longer routes take precedent over shorter ones. This
 * means if there are registered handlers for both `"/public/"` and
 * `"/public/images/"`, the latter will be used for paths starting with
 * `"/public/images/"` and `"/public/"` will be used for all other requests
 * that start with `"/public/"`.
 *
 * Note that routes ending in a slash (`"/"`) are considered a rooted subtree
 * they will match any URLs for which they are a prefix of the full path. This
 * also means a route of just `"/"` will match on all requests, not just ones
 * whose path is exactly `"/"`.
 *
 * If a request is received whose path does not contain a trailing slash, and
 * there are no matches for that path, but there is a registered route that
 * matches the request path with a trailing slash, then the Router will
 * redirect the request with an additional trailing slash.
 *
 * Routes can also start with a hostname which will restrict matches to
 * requests coming from that hostname. Hostname-specific routes take precedence
 * over other registered routes.
 */
export class Router {
  #routeMap: Map<string, Handler> = new Map();
  #orderedRoutes: string[] = [];
  #hosts = false;

  /**
   * Determines if the given path needs a "/" appended to it.
   *
   * This occurs if there are no registered handlers for the path, but there is
   * for the path + "/".
   *
   * @param {string} host The host to match against registered routes.
   * @param {string} path The path to match against registered routes.
   * @returns {boolean} Whether to redirect.
   * @private
   */
  #shouldRedirect(host: string, path: string): boolean {
    const routes = [path, `${host}${path}`];

    for (const route of routes) {
      if (this.#routeMap.has(route)) {
        return false;
      }
    }

    const hasTrailingSlash = path.at(-1) === "/";

    for (const route of routes) {
      if (this.#routeMap.has(`${route}/`)) {
        return !hasTrailingSlash;
      }
    }

    return false;
  }

  /**
   * Matches the route against registered routes.
   *
   * @param {string} route The route to match.
   * @returns {Handler|undefined} The matched handler or undefined if there are no matches.
   * @private
   */
  #match(route: string): Handler | undefined {
    const handler = this.#routeMap.get(route);

    if (handler) {
      return handler;
    }

    for (const registeredRoute of this.#orderedRoutes) {
      if (route.startsWith(registeredRoute)) {
        return this.#routeMap.get(registeredRoute);
      }
    }

    return;
  }

  /**
   * Matches request host and path against registered routes and returns
   * matching handlers.
   *
   * If there is no registered handler for the route a 404 "Not Found" response
   * will be sent.
   *
   * @param {string} host The host to match against registered routes.
   * @param {string} path The path to match against registered routes.
   * @returns {Handler} The matched handler, or the "Not Found" handler if no matches are found.
   * @private
   */
  #matchHandler(host: string, path: string): Handler {
    let handler;

    if (this.#hosts) {
      handler = this.#match(`${host}${path}`);
    }

    handler ??= this.#match(path) ?? _notFoundHandler();

    return handler as Handler;
  }

  /**
   * Retrieves the handler based on the request method, host and path.
   *
   * @param {Request} request The HTTP request to handle.
   * @returns {Handler} The matched handler for the request.
   * @private
   */
  #getHandler(request: Request): Handler {
    const requestUrl = new URL(request.url);
    const hostname = _getHostname(request.headers, requestUrl);
    const path = normalize(requestUrl.pathname);

    if (this.#shouldRedirect(hostname, path)) {
      requestUrl.pathname = `${path}/`;

      return _redirectHandler(requestUrl!, Status.MovedPermanently);
    }

    if (path !== requestUrl.pathname) {
      requestUrl.pathname = path;

      return _redirectHandler(requestUrl, Status.MovedPermanently);
    }

    return this.#matchHandler(hostname, path);
  }

  /**
   * The Router's handler for HTTP requests. For the given request it consults
   * the method, host, and url to match against registered handlers, consumes
   * the request and connection information and returns a response.
   *
   * If the url path is not in it's canonical form, the handler will redirect
   * the request to the canonical path.
   *
   * If there is no registered handler for the route a 404 "Not Found" response
   * will be sent.
   *
   * @param {Request} request The HTTP request to handle.
   * @param {ConnInfo} connInfo Information about the connection the request arrived on.
   * @returns {Response|Promise<Response>} The response to the request.
   */
  handler(request: Request, connInfo: ConnInfo): Response | Promise<Response> {
    const handler = this.#getHandler(request);

    return handler(request, connInfo);
  }

  /**
   * Registers the handler for the given route. If a handler already exists for
   * the route then an error is thrown.
   *
   * @param {string} route The route to match HTTP requests to the provided handler.
   * @param {Handler} handler The handler for individual HTTP requests.
   * @throws {Deno.errors.Http} When an invalid route is used.
   * @throws {Deno.errors.Http} When a handler already exists for the route.
   */
  handle(route: string, handler: Handler): void {
    if (route === "") {
      throw ERROR_INVALID_ROUTE;
    }
    if (this.#routeMap.has(route)) {
      throw new Deno.errors.Http(`Route ${route} already registered`);
    }

    this.#routeMap.set(route, handler);

    if (route.at(-1) === "/") {
      const index = this.#orderedRoutes.findIndex((orderedRoute) =>
        orderedRoute.length < route.length
      );

      this.#orderedRoutes.splice(index, 0, route);
    }

    if (route[0] !== "/") {
      this.#hosts = true;
    }
  }
}
