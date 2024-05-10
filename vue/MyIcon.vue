<template>
  <svg
    v-if="svg"
    class="pf-icon"
    viewBox="0 0 24 24"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    v-html="currentIcon"
  ></svg>
</template>

<script setup lang="ts">
import { computed, PropType, ref } from "vue";

import { IconSvg } from "../types/IconSvg";

const props = defineProps({
  svg: { type: Function as PropType<IconSvg>, required: true },
  color: { type: String, default: undefined },
  hoveredColor: { type: String, default: undefined },
  rotate: { type: [Number, String], default: 0 },
  size: { type: [Number, String], default: 20 },
});

const isHovered = ref(false);

const iconColor = computed(() => props.color ?? "black");
const iconColorHover = computed(() => props.hoveredColor ?? iconColor.value);
const currentColor = computed(() =>
  isHovered.value ? iconColorHover.value : iconColor.value
);

const currentIcon = computed(() => props.svg(currentColor.value));

const iconRotate = computed(() =>
  props.rotate ? `rotate(${props.rotate}deg)` : undefined
);

const refine = (x: string | number) => {
  return typeof x === "number" || !/\D+/.test(x) ? `${x}px` : x;
};
const refinedSize = computed(() => refine(props.size));
</script>

<style lang="scss" scoped>
.pf-icon {
  transform: v-bind(iconRotate);

  width: v-bind("refinedSize");
  min-width: v-bind("refinedSize");
  height: v-bind("refinedSize");
  min-height: v-bind("refinedSize");

  transition-timing-function: ease;
  transition-duration: 200ms;
  transition-property: fill, stroke;
}
</style>
