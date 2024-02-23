import { afterEach, beforeEach, beforeAll, afterAll, describe, it, expect } from "@jest/globals";
import { TestRunCfg } from "helpers/src/TestRunCfg";
import { fullCreate, untilTrue } from "helpers/src/general";
import { moduleUp, moduleDown, untilLogged, logs } from "helpers/src/pepr";
import { secs, mins, sleep } from "helpers/src/time";
import { clean } from "helpers/src/cluster";
import { gone } from "helpers/src/resource";
import { K8s, kind } from "kubernetes-fluent-client";
import { ClusterPolicyReport } from "../types/clusterpolicyreport-v1alpha2";
import { UDSExemptionCRD } from "../types/uds-exemption-crd-v1alpha1";
import { Exemption } from "../types/uds-exemption-v1alpha1";
import exp from "constants";

const trc = new TestRunCfg(__filename);

kind["ClusterPolicyReport"] = ClusterPolicyReport;
kind["Exemption"] = Exemption;

const apply = async res => {
  return await fullCreate(res, kind);
};

const timed = async (m, f) => {
  console.time(m)
  await f()
  console.timeEnd(m)
}

describe("Pepr ClusterPolicyReport()", () => {
  beforeAll(async () => {
    // want the CRD to install automagically w/ the Pepr Module startup (eventually)
    await timed("load ClusterPolicyReport CRD", async () => {
      const crds = await trc.loadRaw(`${trc.root()}/types/wgpolicyk8s.io_clusterpolicyreports.yaml`)
      const crds_applied = await apply(crds)
    })

    await timed("load UDS Exemption CRD", async () => {
      const exemption_applied = await K8s(kind.CustomResourceDefinition).Apply(
        UDSExemptionCRD,
      )
    })

    await moduleUp()
  }, mins(4))

  beforeEach(async () => {
    const file = `${trc.root()}/capabilities/exemption.yaml`
    await timed(`load: ${file}`, async () => {
      const resources = await trc.load(file)
      const resources_applied = await apply(resources)

      await untilLogged('"msg":"pepr-report updated"')
    })
  }, secs(10))

  afterEach(async () => {
    await timed("clean test-labelled resources", async () => {
      //await clean(trc)
    })
  }, mins(3))

  afterAll(async () => {
    await timed("teardown Pepr module", async () => {
      //await moduleDown()
    })
  }, mins(2));

  it("Generate policy report when there is a uds exemption", async () => {
    const cpr = await K8s(ClusterPolicyReport).Get("pepr-report")
    expect(cpr).not.toBeFalsy();
  }, secs(30))

  it("When there are no exemptions delete the cluster policy report", async () => {
    await K8s(Exemption).InNamespace("pexex-policy-report").Delete("exemption")
    await untilTrue(() => gone(ClusterPolicyReport, { metadata: { name: "pepr-report" } }))
  }, secs(30))

  it("Adds a result to the policy report", async () => {
    const cpr = await K8s(ClusterPolicyReport).Get("pepr-report")
    const test_resources = [{kind:"Pod",name:"example-bad-pod"}]

    expect(cpr.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          policy: "exemption:Disallow_Privileged",
          resources: test_resources
        }),
        expect.objectContaining({
          policy: "exemption:Drop_All_Capabilities",
          resources: test_resources
        }),
        expect.objectContaining({
          policy: "exemption:Restrict_Volume_Types",
          resources: test_resources
        }),
      ])
    )
  }, secs(10))
});
