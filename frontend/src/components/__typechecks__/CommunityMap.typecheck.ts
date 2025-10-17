import CommunityMap from "../CommunityMap";
/*
	This file exists purely to typecheck the CommunityMap props at build time.
	It is not imported by runtime code and exports nothing.
*/
import type { ComponentProps } from "react";

type Props = ComponentProps<typeof CommunityMap>;

// Use function() {} instead of arrow functions to match requested style
const sampleProps: Props = {
  communityResult: null,
  onBack: function () {},
  onFocusNode: function () {},
};

void sampleProps;

export {};
