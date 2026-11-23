export interface StageSettings {
  domain: string | undefined;
  removal: "retain" | "remove";
  protect: boolean;
}

const PRODUCTION_STAGE = "prod";
const SHARED_DEVELOPMENT_STAGE = "dev";

function stageDomain(
  stage: string,
  rootDomain: string | undefined,
): string | undefined {
  if (rootDomain === undefined) {
    return undefined;
  }
  if (stage === PRODUCTION_STAGE) {
    return rootDomain;
  }
  if (stage === SHARED_DEVELOPMENT_STAGE) {
    return `${SHARED_DEVELOPMENT_STAGE}.${rootDomain}`;
  }
  return `${stage}.${SHARED_DEVELOPMENT_STAGE}.${rootDomain}`;
}

/**
 * An undefined domain makes the stage serve on its CloudFront distribution's default host,
 * which lets every stage run before the custom domain is purchased.
 */
export function stageSettings(
  stage: string,
  rootDomain?: string,
): StageSettings {
  const domain = stageDomain(stage, rootDomain);
  if (stage === PRODUCTION_STAGE) {
    return { domain, removal: "retain", protect: true };
  }
  if (stage === SHARED_DEVELOPMENT_STAGE) {
    return { domain, removal: "retain", protect: false };
  }
  return { domain, removal: "remove", protect: false };
}
