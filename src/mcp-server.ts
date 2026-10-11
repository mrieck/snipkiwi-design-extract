#!/usr/bin/env node
/**
 * Entry point for the SnipKiwi MCP server.
 *
 * Runs a dependency preflight before loading the real server so a missing
 * `node_modules` (e.g. the plugin cache was copied without its packages) produces
 * one readable message on stderr instead of a bare ERR_MODULE_NOT_FOUND stack.
 */
import { preflight } from './preflight.js';

preflight();
await import('./server.js');
