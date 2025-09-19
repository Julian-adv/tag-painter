// eslint-disable
import { getLocale, trackMessageCall, experimentalMiddlewareLocaleSplitting, isServer } from '../runtime.js';

const en_nocheckpoints_closedialoglabel3 = /** @type {(inputs: {}) => string} */ () => {
	return `Close dialog`
};

const ko_nocheckpoints_closedialoglabel3 = /** @type {(inputs: {}) => string} */ () => {
	return `대화 상자 닫기`
};

/**
* This function has been compiled by [Paraglide JS](https://inlang.com/m/gerre34r).
*
* - Changing this function will be over-written by the next build.
*
* - If you want to change the translations, you can either edit the source files e.g. `en.json`, or
* use another inlang app like [Fink](https://inlang.com/m/tdozzpar) or the [VSCode extension Sherlock](https://inlang.com/m/r7kp499g).
* 
* @param {{}} inputs
* @param {{ locale?: "en" | "ko" }} options
* @returns {string}
*/
/* @__NO_SIDE_EFFECTS__ */
const nocheckpoints_closedialoglabel3 = (inputs = {}, options = {}) => {
	if (experimentalMiddlewareLocaleSplitting && isServer === false) {
		return /** @type {any} */ (globalThis).__paraglide_ssr.nocheckpoints_closedialoglabel3(inputs) 
	}
	const locale = options.locale ?? getLocale()
	trackMessageCall("nocheckpoints_closedialoglabel3", locale)
	if (locale === "en") return en_nocheckpoints_closedialoglabel3(inputs)
	return ko_nocheckpoints_closedialoglabel3(inputs)
};
export { nocheckpoints_closedialoglabel3 as "noCheckpoints.closeDialogLabel" }