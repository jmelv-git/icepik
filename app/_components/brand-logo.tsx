import { getImageProps } from "next/image";
import logo from "../../public/brand/icepik-logo.svg";
import logoDarkText from "../../public/brand/icepik-logo-dark-text.svg";

// The ICEPik logo, on the app's dark surfaces. In high contrast mode with a
// light theme those surfaces turn white, where its light lettering would
// vanish, so the version with dark lettering is shown instead.
export function BrandLogo({ className }: { className: string }) {
  const darkText = getImageProps({ src: logoDarkText, alt: "" }).props;
  const { props } = getImageProps({ src: logo, alt: "ICEPik", loading: "eager" });

  return (
    <picture className={className}>
      <source
        media="(forced-colors: active) and (prefers-color-scheme: light)"
        srcSet={darkText.srcSet ?? darkText.src}
      />
      {/* getImageProps gives the props; next/image has no <picture> of its own. */}
      <img {...props} alt="ICEPik" />
    </picture>
  );
}
