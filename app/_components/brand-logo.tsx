import { getImageProps } from "next/image";
import logo from "../../public/brand/icepik-logo.svg";
import logoDarkText from "../../public/brand/icepik-logo-dark-text.svg";
import logoTall from "../../public/brand/icepik-logo-tall.svg";
import logoTallDarkText from "../../public/brand/icepik-logo-tall-dark-text.svg";

// The ICEPik logo, on the app's dark surfaces. In high contrast mode with a
// light theme those surfaces turn white, where its light lettering would
// vanish, so the version with dark lettering is shown instead.
//
// "wide" has the cube with the words on its right; "tall" has the cube above
// the words. A hidden image with loading="lazy" is not downloaded.
export function BrandLogo({
  className,
  variant = "wide",
  loading = "eager",
}: {
  className: string;
  variant?: "wide" | "tall";
  loading?: "eager" | "lazy";
}) {
  const tall = variant === "tall";
  const darkText = getImageProps({ src: tall ? logoTallDarkText : logoDarkText, alt: "" }).props;
  const { props } = getImageProps({ src: tall ? logoTall : logo, alt: "ICEPik", loading });

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
