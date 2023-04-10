import { Stats } from "@react-three/drei";
import { Leva } from "leva";

// Inject controls and diagnostics into display.
export function Diagnostics(props: { show?: boolean }) {
  let { show = import.meta.env.DEV } = props;

  if (show) {
    return (
      <div>
        <Stats />
        <Leva />
      </div>
    );
  } else {
    return (
      <div>
        <Leva hidden />
      </div>
    );
  }
}
