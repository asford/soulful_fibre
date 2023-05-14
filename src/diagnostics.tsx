import { Stats } from "@react-three/drei";
import { Leva } from "leva";

// Inject controls and diagnostics into display.
export function Diagnostics(props: { show?: boolean, stats?: boolean, leva?: boolean }) {
  let { leva, stats, show = import.meta.env.DEV } = props;
  const comp = [];

  if(show || stats) {
    comp.push(
      <Stats />
    )
  }

  if (show || leva) {
    comp.push(
      <Leva />
    )
  } else {
    comp.push(
      <Leva hidden />
    )
  }
  return (
    <>
    ...comp
    </>
  )
}
