export interface StageSettings {
  domain: string | undefined;
  removal: "retain" | "remove";
  protect: boolean;
}

const PRODUCTION_STAGE = "prod";
const SHARED_DEVELOPMENT_STAGE = "dev";
const LOCAL_FRONTEND_ORIGIN_PATTERN = /^http:\/\/localhost:\d+$/;

/**
 * Sign-in can only complete on the origin Cognito returns to, so a personal stage can be
 * pointed at a frontend dev server on localhost; shared stages always serve their own.
 */
export function localFrontendOrigin(
  stage: string,
  requested: string | undefined,
): string | undefined {
  if (!requested) {
    return undefined;
  }
  if (stage === PRODUCTION_STAGE || stage === SHARED_DEVELOPMENT_STAGE) {
    throw new Error(
      `LOCAL_FRONTEND_ORIGIN is only for personal stages; unset it to deploy ${stage}`,
    );
  }
  if (!LOCAL_FRONTEND_ORIGIN_PATTERN.test(requested)) {
    throw new Error(
      `LOCAL_FRONTEND_ORIGIN must look like http://localhost:3333, got ${requested}`,
    );
  }
  return requested;
}

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
