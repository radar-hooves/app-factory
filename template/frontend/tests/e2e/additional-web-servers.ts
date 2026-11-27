import type { PlaywrightTestConfig } from '@playwright/test';

// Servers this app starts alongside the factory's frontend.
export const additionalWebServers: Exclude<
	NonNullable<PlaywrightTestConfig['webServer']>,
	unknown[]
>[] = [];
