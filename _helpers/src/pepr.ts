import { sleep } from "./time";
import { Cmd } from './Cmd';
import { dirname } from 'node:path';


function sift(stdout) {
  const parsed = stdout
    .filter(l => l !== '')
    .map(l => JSON.parse(l))
    .filter(l => l.url !== "/healthz")
    .filter(l => l.msg !== "Pepr Store update")
    .filter(l => l.name !== "/kube-root-ca.crt")
  
  parsed.sort((l, r) => l.time > r.time ? 1 : -1)
    
  return parsed.map(l => JSON.stringify(l))
}

export async function logs() {
  const pods = await new Cmd({
    cmd: `kubectl get pods -A -l 'pepr.dev/controller=admission' --no-headers --output=name`
  }).run()

  const results = await Promise.all(pods.stdout.filter(n => n !== '').map(async name => new Cmd({
    cmd: `kubectl logs -n pepr-system ${name}`
  }).run()))

  const logs = results.flatMap(r => r.stdout)

  return sift(logs)
}

export async function untilLogged(needle, count = 1) {
  while (true) {
    const logz = await logs()
    const found = logz.filter(l => l.includes(needle))

    if (found.length >= count) { break }
    await sleep(1)
  }
}

export async function peprVersion() {
  // determine npx pepr@version from workspace root
  const root = (await new Cmd({cmd: `npm root`}).run()).stdout[0]
  const workspace = dirname(root)
  const version = (await new Cmd({cwd: workspace, cmd: `npm run pepr -- --version`}).run())
    .stdout.filter(l => l !== '').slice(-1)[0]

  return version
}

export async function moduleUp(peprVersion, {verbose = false} = {}) {
  console.time(`pepr@${peprVersion} ready (total time)`)

  // pepr cmds use default tsconfig.json (NOT the cli's tsconfig.json)
  const pepr = { TS_NODE_PROJECT: "" }

  let cmd = `npx --yes pepr@${peprVersion} build`
  console.time(cmd)
  const build = await new Cmd({env: pepr, cmd}).run()
  if (verbose) { console.log(build) }
  console.timeEnd(cmd)

  cmd = `npx --yes pepr@${peprVersion} deploy --confirm`
  console.time(cmd)
  const deploy = await new Cmd({env: pepr, cmd}).run()
  if (verbose) { console.log(deploy) }
  console.timeEnd(cmd)

  console.time('controller scheduling')
  await untilLogged('✅ Scheduling processed', 2)
  console.timeEnd('controller scheduling')

  console.timeEnd(`pepr@${peprVersion} ready (total time)`)
}