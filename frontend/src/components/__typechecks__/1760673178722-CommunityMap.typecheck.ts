import CommunityMap from "../CommunityMap";
/*
  This file exists purely to typecheck the CommunityMap props at build time.
  It is not imported by runtime code and exports nothing.
*/
import type { ComponentProps } from "react";

type Props = ComponentProps<typeof CommunityMap>;

// Using function() {} instead of arrow to match requested style changes
const sampleProps: Props = {
  communityResult: null,
  onBack: function () {},
  onFocusNode: function () {},
};

void sampleProps;

export {};
