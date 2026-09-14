import { Canvas, useFrame } from "@react-three/fiber";
import { Float, RoundedBox } from "@react-three/drei";
import { useRef } from "react";

function GiftBox({ position, color = "#D9777F" }) {
  const ref = useRef();
  useFrame((s) => {
    if (ref.current) ref.current.rotation.y = s.clock.elapsedTime * 0.4;
  });
  return (
    <group ref={ref} position={position}>
      <RoundedBox args={[1.3, 1.3, 1.3]} radius={0.14} smoothness={4}>
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.05} />
      </RoundedBox>
      <RoundedBox args={[0.22, 1.34, 1.34]} radius={0.06}>
        <meshStandardMaterial color="#FFF4DC" roughness={0.3} />
      </RoundedBox>
      <RoundedBox args={[1.34, 1.34, 0.22]} radius={0.06}>
        <meshStandardMaterial color="#FFF4DC" roughness={0.3} />
      </RoundedBox>
    </group>
  );
}

function Crystal({ position, color = "#7B62A3" }) {
  const ref = useRef();
  useFrame((s) => {
    if (ref.current) ref.current.rotation.x = s.clock.elapsedTime * 0.5;
  });
  return (
    <mesh ref={ref} position={position}>
      <icosahedronGeometry args={[0.7, 0]} />
      <meshStandardMaterial color={color} roughness={0.1} metalness={0.3} flatShading />
    </mesh>
  );
}

function Ring({ position, color = "#617052" }) {
  const ref = useRef();
  useFrame((s) => {
    if (ref.current) ref.current.rotation.z = s.clock.elapsedTime * 0.6;
  });
  return (
    <mesh ref={ref} position={position} rotation={[Math.PI / 3, 0, 0]}>
      <torusGeometry args={[0.55, 0.18, 20, 40]} />
      <meshStandardMaterial color={color} roughness={0.3} metalness={0.2} />
    </mesh>
  );
}

function Rig() {
  useFrame((state) => {
    const x = (state.pointer.x * Math.PI) / 20;
    const y = (state.pointer.y * Math.PI) / 20;
    state.camera.position.x += (x * 2 - state.camera.position.x) * 0.05;
    state.camera.position.y += (-y * 2 - state.camera.position.y) * 0.05;
    state.camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function HeroScene() {
  return (
    <Canvas camera={{ position: [0, 0, 6], fov: 45 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={0.8} />
      <directionalLight position={[5, 5, 5]} intensity={1.1} />
      <pointLight position={[-5, -3, 2]} intensity={0.6} color="#FCEEE9" />
      <Float speed={2} rotationIntensity={0.6} floatIntensity={1.2}>
        <GiftBox position={[0, 0.2, 0]} />
      </Float>
      <Float speed={2.6} rotationIntensity={1} floatIntensity={1.6}>
        <Crystal position={[-2.2, 1, -0.5]} />
      </Float>
      <Float speed={1.8} rotationIntensity={0.8} floatIntensity={1.4}>
        <Ring position={[2.2, -0.8, 0.2]} />
      </Float>
      <Float speed={2.2} rotationIntensity={0.5} floatIntensity={1.2}>
        <Crystal position={[2, 1.4, -1]} color="#D9933B" />
      </Float>
      <Rig />
    </Canvas>
  );
}
