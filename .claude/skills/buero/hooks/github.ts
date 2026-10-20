// What the office asks GitHub about a pull request, through the github MCP
// server: its state and mergeability, and what CI says about its head.

import type { EngineInterface } from 'claude-code'

import type { CiStand } from '../types'
import { checkRunsIn, mergeStateIn } from './cloud'
import type { PrState } from './cloud'
import { textOf, unsaved } from './db'

type $ = EngineInterface

export const GITHUB_SERVER = 'github'

/** What CI says about a pull request's head; undefined when GitHub could not be asked. */
export async function fetchCi($: $, owner: string, repo: string, number: number, now: number): Promise<CiStand | undefined> {
  try {
    const answer = await $.mcp.call(GITHUB_SERVER, 'pull_request_read', { method: 'get_check_runs', owner, repo, pullNumber: number, perPage: 100 })

    return answer.isError ? undefined : checkRunsIn(await unsaved($, textOf(answer)), now)
  } catch (error) {
    $.ui.log(`buero: get_check_runs: ${String(error)}`, { to: 'debug' })

    return undefined
  }
}

/** A pull request's state, mergeability and head; undefined when GitHub could not be asked. */
export async function fetchPr($: $, owner: string, repo: string, number: number): Promise<PrState | undefined> {
  try {
    const answer = await $.mcp.call(GITHUB_SERVER, 'pull_request_read', { method: 'get', owner, repo, pullNumber: number })

    return answer.isError ? undefined : mergeStateIn(await unsaved($, textOf(answer)))
  } catch (error) {
    $.ui.log(`buero: pull_request_read: ${String(error)}`, { to: 'debug' })

    return undefined
  }
}
