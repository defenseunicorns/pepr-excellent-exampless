import { Capability, a, Log } from "pepr";

const name = "hello-pepr-global";

export const HelloPeprGlobal = new Capability({
  name: name,
  description: name,
  namespaces: [name],
});
const { When } = HelloPeprGlobal;

When(a.Namespace)
  .IsCreated()
  .Mutate(async request => {
    request.SetAnnotation("pepr", "was here")
  });

When(a.ConfigMap)
  .IsCreated()
  .InNamespace(name)
  .WithName("noop")
  .Mutate(async request => {
    Log.info({ITS: process.env.ITS}, "env")
  });

When(a.ConfigMap)
  .IsCreated()
  .InNamespace(name)
  .WithName("noop")
  .Validate(async request => {
    Log.info({}, "noop")
    return request.Approve()
  });
