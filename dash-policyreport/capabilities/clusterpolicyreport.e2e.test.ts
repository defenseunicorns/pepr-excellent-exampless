import { afterEach, beforeEach, beforeAll, afterAll, describe, it, expect } from "@jest/globals";
import { TestRunCfg } from "helpers/src/TestRunCfg";
import { fullCreate, untilTrue } from "helpers/src/general";
import { moduleUp, moduleDown, untilLogged, logs } from "helpers/src/pepr";
import { secs, mins, timed } from "helpers/src/time";
import { clean } from "helpers/src/cluster";
import { gone } from "helpers/src/resource";
import { K8s, kind } from "kubernetes-fluent-client";
import { ClusterPolicyReport } from "../types/clusterpolicyreport-v1beta1";
import { UDSExemptionCRD } from "../types/uds-exemption-crd-v1alpha1";
import { Exemption } from "../types/uds-exemption-v1alpha1";
import { StatusFilterElement } from "../types/policyreport-v1beta1";
import { exemptionResourceProperty } from "./clusterpolicyreport"

const trc = new TestRunCfg(__filename);

kind["ClusterPolicyReport"] = ClusterPolicyReport;
kind["Exemption"] = Exemption;

const apply = async res => {
  return await fullCreate(res, kind);
};

describe("ClusterPolicyReport", () => {
  beforeAll(async () => {
    // want the CRD to install automagically w/ the Pepr Module startup (eventually)
    await timed("load ClusterPolicyReport CRD", async () => {
      const crds = await trc.loadRaw(`${trc.root()}/types/wgpolicyk8s.io_clusterpolicyreports.yaml`)
      const crds_applied = await apply(crds)
    })

    // assumed to already exist as part of UDS install
    await timed("load UDS Exemption CRD", async () => {
      const exemption_applied = await K8s(kind.CustomResourceDefinition).Apply(
        UDSExemptionCRD,
      )
    })

    await moduleUp()

    const file = `${trc.root()}/capabilities/scenario.defaults.yaml`
    await timed(`load: ${file}`, async () => {
      const resources = await trc.load(file)
      await apply(resources)
    })
  }, mins(3))

  

  afterEach(async () => { await clean(trc) }, mins(3))

  afterAll(async () => { await moduleDown() }, mins(2));

  it("is created when UDS Exemption exists", async () => {
    const cpr = await K8s(ClusterPolicyReport).Get("pepr-report")
    expect(cpr).not.toBeFalsy();
  }, secs(30))

  it("is deleted when UDS Exemptions are gone", async () => {
    await K8s(Exemption).InNamespace("pexex-clusterpolicyreport").Delete("allow-naughtiness")
    await untilTrue(() => gone(ClusterPolicyReport, { metadata: { name: "pepr-report" } }))
  }, secs(30))

  it("has a result for each UDS Exemption policy", async () => {
    const file = `${trc.root()}/capabilities/scenario.basic.yaml`

    await timed(`load: ${file}`, async () => {
      const resources = await trc.load(file)
      const resources_applied = await apply(resources)
      console.log(await logs())
      await untilLogged('"msg":"pepr-report updated"')
    }), secs(20)

    const cpr = await K8s(ClusterPolicyReport).Get("pepr-report")

    const naughty = {
      "apiVersion": "v1",
      "kind": "Pod",
      "namespace": "pexex-clusterpolicyreport",
      "name": "naughty-pod",
    }

    expect(cpr).toMatchObject(({
      apiVersion: "wgpolicyk8s.io/v1beta1",
      kind: "ClusterPolicyReport",
      metadata: {
        name: "pepr-report",
        labels: { "policy.kubernetes.io/engine": "pepr" },
        annotations: {
          "uds-core.pepr.dev/uds-core-policies": "exemptions"
        }
      },
      summary: {
        pass: 11,
        fail: 3,
        warn: 0, 
        error: 0,
        skip: 0,
      },
      results: [
        {
          policy: "DisallowHostNamespaces",
          result: StatusFilterElement.Pass,
          resources: [],
          properties: {},
        },
        {
          policy: "DisallowNodePortServices",
          result: StatusFilterElement.Pass,
          resources: [],
          properties: {},
        },
        {
          policy: "DisallowPrivileged",
          result: StatusFilterElement.Fail,
          resources: [naughty],
          properties: { [exemptionResourceProperty]: "pexex-clusterpolicyreport:allow-naughtiness" }
        },
        {
          policy: "DisallowSELinuxOptions",
          result: StatusFilterElement.Pass,
          resources: [],
          properties: {},
        },
        {
          policy: "DropAllCapabilities",
          result: StatusFilterElement.Fail,
          resources: [naughty],
          properties: { [exemptionResourceProperty] : "pexex-clusterpolicyreport:allow-naughtiness" }
        },
        {
          policy: "RequireNonRootUser",
          result: StatusFilterElement.Pass,
          resources: [],
          properties: {},
        },
        {
          policy: "RestrictCapabilities",
          result: StatusFilterElement.Pass,
          resources: [],
          properties: {},
        },
        {
          policy: "RestrictExternalNames",
          result: StatusFilterElement.Pass,
          resources: [],
          properties: {},
        },
        {
          policy: "RestrictHostPathWrite",
          result: StatusFilterElement.Pass,
          resources: [],
          properties: {},
        },
        {
          policy: "RestrictHostPorts",
          result: StatusFilterElement.Pass,
          resources: [],
          properties: {},
        },
        {
          policy: "RestrictProcMount",
          result: StatusFilterElement.Pass,
          resources: [],
          properties: {},
        },
        {
          policy: "RestrictSELinuxType",
          result: StatusFilterElement.Pass,
          resources: [],
          properties: {},
        },
        {
          policy: "RestrictSeccomp",
          result: StatusFilterElement.Pass,
          resources: [],
          properties: {},
        },
        {
          policy: "RestrictVolumeTypes",
          result: StatusFilterElement.Fail,
          resources: [naughty],
          properties: { [exemptionResourceProperty] : "pexex-clusterpolicyreport:allow-naughtiness"}
        },
      ]
    }))
  }, secs(10))

  it("correctly updates report when a new pod with an existing failing policy is created", async () => {
   
    const firstExemptPod = `${trc.root()}/capabilities/scenario.basic.yaml`

    await timed(`load: ${firstExemptPod}`, async () => {
      const resources = await trc.load(firstExemptPod)
      const resources_applied = await apply(resources)
      console.log(await logs())
      await untilLogged('"msg":"pepr-report updated"')
    }), secs(20)

    const nextExemptPod = `${trc.root()}/capabilities/scenario.new-exemption-same-pod.yaml`
    
    await timed(`load: ${nextExemptPod}`, async () => {
      const resources = await trc.load(nextExemptPod)
      const resources_applied = await apply(resources)
      console.log(await logs())
      await untilLogged('"msg":"pepr-report updated"')
    }), secs(20)

    const cpr = await K8s(ClusterPolicyReport).Get("pepr-report") 
    
    const naughty = {
      "apiVersion": "v1",
      "kind": "Pod",
      "namespace": "pexex-clusterpolicyreport",
      "name": "naughty-pod",
    }

    const not_nice = {
      "apiVersion": "v1",
      "kind": "Pod",
      "namespace": "default",
      "name": "not-as-nice-pod",
    }

    expect(cpr.summary).toEqual({
        pass: 10,
        fail: 4,
        warn: 0, 
        error: 0,
        skip: 0,
      })

    expect(cpr.results).toContainEqual(
        {
          policy: "DisallowPrivileged",
          result: StatusFilterElement.Fail,
          resources: [naughty, not_nice],
          properties: { [exemptionResourceProperty] : "pexex-clusterpolicyreport:allow-naughtiness" }
        }
    )
  }, secs(120))
});
