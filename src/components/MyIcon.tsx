import React, { useState, useMemo } from "react";
import { IconSvg } from "../types/IconSvg";

interface IconProps {
  svg: IconSvg;
  color?: string;
  hoveredColor?: string;
  rotate?: number | string;
  size?: number | string;
  onClick?: () => void;
}

const refine = (x: string | number) => {
  return typeof x === "number" || !/\D+/.test(x) ? `${x}px` : x;
};

const MyIcon: React.FC<IconProps> = ({
  svg,
  color,
  hoveredColor,
  rotate,
  size,
  onClick,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const iconColor = useMemo(() => color ?? "black", [color]);
  const iconColorHover = useMemo(
    () => hoveredColor ?? iconColor,
    [hoveredColor, iconColor]
  );
  const currentColor = useMemo(
    () => (isHovered ? iconColorHover : iconColor),
    [isHovered, iconColorHover, iconColor]
  );
  const iconRotate = useMemo(
    () => (rotate ? `rotate(${rotate}deg)` : undefined),
    [rotate]
  );
  const refinedSize = useMemo(() => refine(size ?? 24), [size]);

  const currentIcon = useMemo(() => svg(currentColor), [svg, currentColor]);

  return (
    <svg
      className="pf-icon"
      viewBox="0 0 24 24"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      dangerouslySetInnerHTML={{ __html: currentIcon }}
      style={{
        transform: iconRotate,
        width: refinedSize,
        minWidth: refinedSize,
        height: refinedSize,
        minHeight: refinedSize,
        transitionTimingFunction: "ease",
        transitionDuration: "200ms",
        transitionProperty: "fill, stroke",
      }}
      onClick={onClick}
    ></svg>
  );
};

export default MyIcon;
