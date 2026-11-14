<script lang="ts">
	import { T } from '@threlte/core';
</script>

<!--
  The map uses normal PBR materials, not `KHR_materials_unlit`. Without lights the
  scene looks black, so this layer adds a soft hemisphere light, a
  warm directional light and a cool fill from the opposite side.
-->
<T.HemisphereLight args={['#dbe7ff', '#3a2a1a', 1.4]} />
<T.DirectionalLight position={[45, 65, 25]} intensity={2.4} />
<T.DirectionalLight position={[-35, 30, -20]} intensity={0.7} color="#9fb4ff" />
<T.AmbientLight intensity={0.3} />
