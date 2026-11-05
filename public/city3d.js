(() => {
  const canvas = document.getElementById("sethelion-3d");
  if (!canvas || !window.THREE) return;

  const THREE = window.THREE;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#050912");
  scene.fog = new THREE.FogExp2("#071321", 0.005);

  const camera = new THREE.PerspectiveCamera(
    42, innerWidth / innerHeight, 0.1, 1500
  );
  camera.position.set(0, 29, 112);

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.38;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.add(new THREE.AmbientLight("#9ab9dc", 1.1));

  const moon = new THREE.DirectionalLight("#83bfff", 2.5);
  moon.position.set(-30, 50, 35);
  scene.add(moon);

  const blueLight = new THREE.PointLight("#087dff", 180, 150);
  blueLight.position.set(0, 18, 0);
  scene.add(blueLight);

  const city = new THREE.Group();
  scene.add(city);

  const glassMaterials = [
    new THREE.MeshPhysicalMaterial({
      color: "#162c43", metalness: .75, roughness: .19,
      clearcoat: 1, clearcoatRoughness: .12
    }),
    new THREE.MeshPhysicalMaterial({
      color: "#253e56", metalness: .65, roughness: .22,
      clearcoat: 1
    }),
    new THREE.MeshPhysicalMaterial({
      color: "#0d1c2d", metalness: .85, roughness: .16,
      clearcoat: 1
    })
  ];

  const windowMaterial = new THREE.MeshBasicMaterial({
    color: "#49baff"
  });

  const buildings = [];

  function building(x, z, width, height, depth, index) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    city.add(group);

    const material = glassMaterials[index % glassMaterials.length];

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      material
    );
    body.position.y = height / 2;
    group.add(body);

    // SETHELION-ARCHITECTURE-X
    const facade = new THREE.Group();
    group.add(facade);

    const silverMetal = new THREE.MeshStandardMaterial({
      color: "#8195a9",
      metalness: .92,
      roughness: .22
    });

    const darkGlass = new THREE.MeshPhysicalMaterial({
      color: "#18334d",
      metalness: .88,
      roughness: .13,
      clearcoat: 1,
      clearcoatRoughness: .08
    });

    // Vertical architectural mullions
    const mullionCount = Math.max(3, Math.floor(width / 2));

    for (let j = 0; j <= mullionCount; j++) {
      const xPos = -width/2 + j * width/mullionCount;

      const mullion = new THREE.Mesh(
        new THREE.BoxGeometry(.09, height, .11),
        silverMetal
      );
      mullion.position.set(xPos, height/2, depth/2 + .07);
      facade.add(mullion);
    }

    // Horizontal floor divisions
    for (let y = 4; y < height; y += 4) {
      const floorBand = new THREE.Mesh(
        new THREE.BoxGeometry(width + .15, .11, depth + .15),
        silverMetal
      );
      floorBand.position.y = y;
      facade.add(floorBand);
    }

    // Dark glass side facade
    for (const side of [-1, 1]) {
      const glassPanel = new THREE.Mesh(
        new THREE.BoxGeometry(.035, height * .94, depth * .82),
        darkGlass
      );
      glassPanel.position.set(
        side * (width/2 + .025),
        height/2,
        0
      );
      facade.add(glassPanel);
    }

    // SETHELION BLACK TITANIUM PODIUM
    const podiumMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x08090b,
      metalness: 0.82,
      roughness: 0.24,
      clearcoat: 1,
      clearcoatRoughness: 0.16
    });

    const podium = new THREE.Mesh(
      new THREE.BoxGeometry(width * 1.22, 2.5, depth * 1.22),
      podiumMaterial
    );
    podium.position.y = 1.25;
    podium.material = new THREE.MeshPhysicalMaterial({
      color: 0x020304,
      metalness: 0.9,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.12
    });
    group.add(podium);

    // Setback rooftop architecture
    const rooftop = new THREE.Mesh(
      new THREE.BoxGeometry(width * .65, 2, depth * .65),
      darkGlass
    );
    rooftop.position.y = height + 1;
    group.add(rooftop);


    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(
        new THREE.BoxGeometry(width, height, depth)
      ),
      new THREE.LineBasicMaterial({
        color: "#6bbcff",
        transparent: true,
        opacity: .19
      })
    );
    edges.position.y = height / 2;
    group.add(edges);

    // Crown and architectural details
    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(width * .72, 1.2, depth * .72),
      new THREE.MeshStandardMaterial({
        color: "#718da8", metalness: .9, roughness: .2
      })
    );
    crown.position.y = height + .6;
    group.add(crown);

    // Random illuminated office windows
    const windows = new THREE.Group();
    const cols = Math.max(2, Math.floor(width / 1.35));
    const rows = Math.floor(height / 2.1);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (Math.random() > .43) continue;

        const pane = new THREE.Mesh(
          new THREE.BoxGeometry(.43, .56, .035),
          windowMaterial
        );

        pane.position.set(
          -width / 2 + .7 + col * (width - 1.2) / cols,
          1.3 + row * 2.1,
          depth / 2 + .025
        );

        pane.userData.phase = Math.random() * 6.28;
        pane.userData.base = .18 + Math.random() * .55;
        pane.material = windowMaterial.clone();
        pane.material.transparent = true;
        windows.add(pane);
      }
    }

    group.add(windows);

    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(.035, .08, 5, 6),
      new THREE.MeshBasicMaterial({ color: "#43baff" })
    );
    antenna.position.y = height + 3;
    group.add(antenna);

    buildings.push({ group, windows, height, index, podium });
  }

  // Central financial district
  const layout = [
    [-20,-15,12,52,12],
    [-9,-20,13,76,13],
    [7,-20,14,105,14],
    [23,-13,13,68,13],
    [35,0,12,83,12],
    [-31,0,13,73,13],
    [-19,12,14,91,14],
    [-5,14,12,65,12],
    [12,12,14,98,14],
    [29,17,13,74,13],
    [-34,25,12,58,12],
    [-17,29,13,79,13],
    [2,30,14,68,14],
    [20,29,13,88,13],
    [38,25,12,60,12],
    [-42,-20,12,55,12],
    [44,-17,12,63,12]
  ];

  layout.forEach((b, i) => building(...b, i));


  // SETHELION-ICONIC-TOWER
  const towerCore = new THREE.Group();
  towerCore.position.set(0, 0, -37);
  city.add(towerCore);

  const chrome = new THREE.MeshPhysicalMaterial({
    color: "#172b42",
    metalness: .96,
    roughness: .13,
    clearcoat: 1,
    clearcoatRoughness: .08
  });

  const towerGlass = new THREE.MeshPhysicalMaterial({
    color: "#16436a",
    metalness: .82,
    roughness: .12,
    clearcoat: 1,
    emissive: "#062447",
    emissiveIntensity: .5
  });

  // Monumental central structure
  const towerBase = new THREE.Mesh(
    new THREE.BoxGeometry(17, 8, 17), chrome
  );
  towerBase.position.y = 4;
  towerCore.add(towerBase);

  const towerBody = new THREE.Mesh(
    new THREE.BoxGeometry(12, 76, 12), towerGlass
  );
  towerBody.position.y = 46;
  towerCore.add(towerBody);

  // Architectural setbacks
  for (let i = 0; i < 4; i++) {
    const tier = new THREE.Mesh(
      new THREE.BoxGeometry(
        12 - i * 1.7, 1.2, 12 - i * 1.7
      ), chrome
    );
    tier.position.y = 12 + i * 17;
    towerCore.add(tier);
  }

  // Crown
  const crown = new THREE.Mesh(
    new THREE.BoxGeometry(7, 10, 7),
    new THREE.MeshStandardMaterial({
      color: "#a9c8e5",
      metalness: .95,
      roughness: .15,
      emissive: "#167dff",
      emissiveIntensity: .7
    })
  );
  crown.position.y = 89;
  towerCore.add(crown);

  const spire = new THREE.Mesh(
    new THREE.CylinderGeometry(.035, .16, 19, 12),
    new THREE.MeshBasicMaterial({color:"#63caff"})
  );
  spire.position.y = 103;
  towerCore.add(spire);

  // Glowing architectural outlines
  const towerEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(
      new THREE.BoxGeometry(12.1, 76.1, 12.1)
    ),
    new THREE.LineBasicMaterial({
      color: "#43baff",
      transparent: true,
      opacity: .55
    })
  );
  towerEdges.position.y = 46;
  towerCore.add(towerEdges);

  // Signature orbital light rings
  const towerRings = [];

  [24, 49, 76].forEach((height, i) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(10 + i * 2, .075, 8, 120),
      new THREE.MeshBasicMaterial({
        color: i === 1 ? "#a9e8ff" : "#168cff",
        transparent: true,
        opacity: .8
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = height;
    towerCore.add(ring);
    towerRings.push(ring);
  });

  // OLD REAR TOWER LOGO REMOVED

  const towerLight = new THREE.PointLight("#168cff", 240, 110);
  towerLight.position.set(0, 60, -37);
  scene.add(towerLight);

  const crownLight = new THREE.PointLight("#80d9ff", 130, 65);
  crownLight.position.set(0, 100, -37);
  scene.add(crownLight);

  // Financial district ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 180),
    new THREE.MeshStandardMaterial({
      color: "#071321", metalness: .65, roughness: .4
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.2;
  city.add(ground);

  // Roads with blue illuminated edges
  for (let i = -4; i <= 4; i++) {
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(.045, .025, 150),
      new THREE.MeshBasicMaterial({
        color: "#168cff", transparent: true, opacity: .48
      })
    );
    road.position.set(i * 9, .02, 0);
    city.add(road);
  }

  // Atmospheric stars
  const starGeometry = new THREE.BufferGeometry();
  const starPositions = [];

  for (let i = 0; i < 900; i++) {
    starPositions.push(
      (Math.random() - .5) * 350,
      25 + Math.random() * 110,
      (Math.random() - .5) * 250
    );
  }

  starGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(starPositions, 3)
  );

  scene.add(new THREE.Points(
    starGeometry,
    new THREE.PointsMaterial({
      color: "#9acfff", size: .24, transparent: true, opacity: .65
    })
  ));


  // Animated financial district traffic
  const traffic = [];
  const trafficMaterial = new THREE.MeshBasicMaterial({
    color: "#36baff"
  });

  for (let i = 0; i < 38; i++) {
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(.13, 8, 8),
      trafficMaterial.clone()
    );
    light.position.y = .18;
    city.add(light);
    traffic.push({
      light,
      lane: Math.floor(Math.random() * 9) * 9 - 36,
      offset: Math.random() * 150,
      speed: 5 + Math.random() * 10
    });
  }

  // Reflective illuminated boulevard
  const boulevard = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 150),
    new THREE.MeshStandardMaterial({
      color: "#102b43",
      metalness: .95,
      roughness: .2,
      emissive: "#062d50",
      emissiveIntensity: .55
    })
  );
  boulevard.rotation.x = -Math.PI / 2;
  boulevard.position.set(0, .035, 0);
  city.add(boulevard);

  // Silver-blue skyline atmosphere
  const skylineLight = new THREE.PointLight("#267dff", 110, 100);
  skylineLight.position.set(-25, 30, -20);
  scene.add(skylineLight);

// Architectural shadow reception
city.traverse(obj => {
  if (obj.isMesh) obj.receiveShadow = true;
});

buildings.forEach(({group, windows}) => {
  group.traverse(obj => {
    if (obj.isMesh && !windows.children.includes(obj)) {
      obj.castShadow = true;
    }
  });
});

let scroll = 0;
  let targetScroll = 0;

  addEventListener("scroll", () => {
    targetScroll = Math.min(scrollY / 1500, 1);
  }, { passive: true });

  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    const t = clock.getElapsedTime();



    scroll += (targetScroll - scroll) * .035;

    camera.position.x = Math.sin(t * .035) * 1.2;
    camera.position.y = 29 - scroll * 2;
    camera.position.z = 112 - scroll * 5;

    camera.lookAt(0, 20 - scroll * 2, 0);

    buildings.forEach(({ windows }, i) => {
      windows.children.forEach(pane => {
        const pulse = .5 + .5 * Math.sin(t * .65 + pane.userData.phase);
        pane.material.opacity = pane.userData.base * (.55 + pulse * .45);
      });
    });

    blueLight.intensity = 150 + Math.sin(t * .6) * 20;

    traffic.forEach(({light, lane, offset, speed}) => {
      light.position.x = lane;
      light.position.z = ((offset + t * speed) % 150) - 75;
      light.material.opacity = .55 + .4 * Math.sin(t * 2 + offset);
    });

    skylineLight.intensity = 90 + Math.sin(t * .35) * 20;


    towerCore.rotation.y = Math.sin(t * .12) * .035;
    towerRings.forEach((ring, i) => {
      ring.rotation.z = t * (i % 2 ? -.16 : .16);
      ring.material.opacity = .55 + .25 * Math.sin(t * .8 + i);
    });
    towerLight.intensity = 210 + Math.sin(t * .7) * 35;
    crownLight.intensity = 110 + Math.sin(t * .9) * 25;


    // SETHELION DUBAI ROYAL DISTRICT
    if (!scene.userData.dubaiRoyalInstalled) {
      scene.userData.dubaiRoyalInstalled = true;

      const royal = new THREE.Group();

      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(180, 35),
        new THREE.MeshStandardMaterial({
          color: 0x263747, roughness: 0.8
        })
      );
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, -0.08, 43);
      royal.add(road);

      const sidewalkMat = new THREE.MeshStandardMaterial({
        color: 0xb4b7b4, roughness: 0.72
      });

      const gold = new THREE.MeshStandardMaterial({
        color: 0xc9a66b,
        metalness: 0.7,
        roughness: 0.3
      });

      const green = new THREE.MeshStandardMaterial({
        color: 0x285a43,
        roughness: 0.9
      });

      const water = new THREE.MeshStandardMaterial({
        color: 0x287b9b,
        metalness: 0.65,
        roughness: 0.16,
        transparent: true,
        opacity: 0.82
      });

      function slab(w,d,x,z,material,y=-0.025) {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(w,d), material
        );
        m.rotation.x = -Math.PI/2;
        m.position.set(x,y,z);
        royal.add(m);
      }

      // Luxury sidewalks
      slab(180,5,0,23,sidewalkMat);
      slab(180,5,0,63,sidewalkMat);

      // Minimal dark boulevard — no golden strips.

      // Landscaped gardens and reflecting pools
      for (const x of [-66,-42,42,66]) {
        slab(13,12,x,15,green);

        const pool = new THREE.Mesh(
          new THREE.BoxGeometry(7,.12,3),
          water
        );
        pool.position.set(x,0.05,15);
        royal.add(pool);

        // Garden trees removed — clean luxury landscape

      }

      // Warm architectural lighting
      const boulevardLight = new THREE.PointLight(
        0xffd69a, 28, 65
      );
      boulevardLight.position.set(0,7,35);
      royal.add(boulevardLight);

      scene.add(royal);

      // More luxurious lighting on existing architecture
      scene.traverse(obj => {
        if (!obj.isMesh || !obj.material) return;
        const materials = Array.isArray(obj.material)
          ? obj.material : [obj.material];

        materials.forEach(mat => {
          if (!mat.color) return;
          if (mat.metalness !== undefined &&
              mat.metalness > 0.15) {
            mat.roughness = Math.min(mat.roughness, 0.34);
          }
        });
      });

      console.log("SETHELION DUBAI ROYAL DISTRICT READY");
    }



    renderer.render(scene, camera);
  }

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  }

  addEventListener("resize", resize);
  animate();
})();
