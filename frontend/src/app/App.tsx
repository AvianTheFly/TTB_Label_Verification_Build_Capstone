import { BackendStartupStatus } from "./BackendStartupStatus";
import { PackageWorkflow } from "../features/package-workflow/PackageWorkflow";

export function App() {
  return (
    <>
      <BackendStartupStatus />
      <PackageWorkflow />
    </>
  );
}
