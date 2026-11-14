import { Overlay } from '@/components/overlay';
import { MyTrip } from '@/components/my-trip';
export default function BuilderModal() {
  return (
    <Overlay kind="builder">
      <MyTrip overlay />
    </Overlay>
  );
}
