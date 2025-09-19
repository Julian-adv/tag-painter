// eslint-disable
import { getLocale, trackMessageCall, experimentalMiddlewareLocaleSplitting, isServer } from '../runtime.js';

const en_nocheckpoints_openbutton2 = /** @type {(inputs: {}) => string} */ () => {
	return `Open`
};

const ko_nocheckpoints_openbutton2 = /** @type {(inputs: {}) => string} */ () => {
	return `열기`
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
const nocheckpoints_openbutton2 = (inputs = {}, options = {}) => {
	if (experimentalMiddlewareLocaleSplitting && isServer === false) {
		return /** @type {any} */ (globalThis).__paraglide_ssr.nocheckpoints_openbutton2(inputs) 
	}
	const locale = options.locale ?? getLocale()
	trackMessageCall("nocheckpoints_openbutton2", locale)
	if (locale === "en") return en_nocheckpoints_openbutton2(inputs)
	return ko_nocheckpoints_openbutton2(inputs)
};
export { nocheckpoints_openbutton2 as "noCheckpoints.openButton" }