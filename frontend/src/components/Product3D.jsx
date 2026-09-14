import { Canvas } from "@react-three/fiber";
import { OrbitControls, RoundedBox, useTexture, Center } from "@react-three/drei";
import { Suspense } from "react";

function Model({ image }) {
  const tex = useTexture(image);
  return (
    <Center>
      <RoundedBox args={[2.4, 2.4, 0.5]} radius={0.12} smoothness={4}>
        <meshStandardMaterial map={tex} roughness={0.4} />
      </RoundedBox>
    </Center>
  );
}

export default function Product3D({ image }) {
  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 40 }} dpr={[1, 1.5]} gl={{ alpha: true }}>
      <ambientLight intensity={1} />
      <directionalLight position={[4, 4, 5]} intensity={1.2} />
      <Suspense fallback={null}>
        <Model image={image} />
      </Suspense>
      <OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={2.5} />
    </Canvas>
  );
}
