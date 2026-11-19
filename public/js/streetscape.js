// Vật liệu lặp lại theo kích thước của một gian nhà hoặc một ô lát phố.
'use strict';
function streetTexture(width, height, paint) {
  var canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d'));
  var texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function surfaceGrain(ctx, size, density) {
  // Cùng một mẫu hạt cho mọi máy, không thay đổi theo frame.
  var seed = 73;
  for (var i = 0; i < density; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    var x = (seed >>> 8) % size, y = (seed >>> 20) % size;
    ctx.fillStyle = i % 2 ? 'rgba(255,248,214,.055)' : 'rgba(27,43,43,.085)';
    ctx.fillRect(x, y, 1, 1);
  }
}

function pavementTexture(brick) {
  return streetTexture(128, 128, function (c) {
    c.fillStyle = brick ? '#d3c5af' : '#586264';
    c.fillRect(0, 0, 128, 128);
    if (brick) {
      for (var row = 0; row < 8; row++) {
        for (var col = -1; col < 4; col++) {
          c.fillStyle = ['#ecddc6', '#e7d9c3', '#eadcc7'][Math.abs(col + row * 2) % 3];
          c.fillRect(col * 32 + (row % 2) * 16, row * 16, 31, 15);
        }
      }
    }
    surfaceGrain(c, 128, 6500);
  });
}

function facadeTexture(upper) {
  return streetTexture(256, 256, function (c) {
    function rect(x, y, w, h, color) {
      c.fillStyle = color;
      c.fillRect(x, y, w, h);
    }
    rect(0, 0, 256, 256, '#fff0cc');
    rect(0, 0, 256, 7, '#c1aa8e');
    rect(0, 8, 256, 5, '#fff9de');
    rect(5, 10, 10, 246, '#f4d9ab');
    rect(239, 10, 10, 246, '#e6cba4');
    if (upper) {
      rect(31, 55, 194, 152, '#d7bf9c');
      rect(38, 47, 180, 152, '#fff9df');
      rect(44, 53, 168, 140, '#284b47');
      rect(92, 57, 72, 131, '#476666');
      rect(99, 63, 58, 119, '#354e4c');
      for (var y = 67; y < 180; y += 23) rect(100, y, 56, 3, '#91a29a');
      rect(126, 57, 4, 131, '#a1b4a5');
      [49, 169].forEach(function (x) {
        rect(x, 57, 39, 131, '#56837a');
        for (var slat = 62; slat < 185; slat += 8) rect(x + 3, slat, 33, 3, '#365f57');
      });
      rect(33, 195, 190, 8, '#fff7d7');
      rect(33, 203, 190, 4, '#bda885');
    } else {
      rect(0, 228, 256, 28, '#c0ae93');
      rect(24, 58, 208, 194, '#76543a');
      rect(30, 65, 196, 187, '#304b45');
      rect(35, 71, 186, 26, '#9cab8d');
      for (var bar = 42; bar < 216; bar += 21) rect(bar, 71, 4, 26, '#48655a');
      [36, 165].forEach(function (x) {
        rect(x, 106, 53, 146, '#709184');
        for (var panel = 112; panel < 244; panel += 11) rect(x + 4, panel, 45, 5, '#56786c');
      });
      rect(96, 107, 64, 145, '#243d39');
      rect(101, 116, 52, 122, '#3b4c44');
      for (var shelf = 0; shelf < 3; shelf++) {
        var level = 145 + shelf*29;
        rect(101, level, 52, 4, '#b59367');
        for (var jar = 0; jar < 4; jar++) {
          var xx = 103 + jar*12;
          rect(xx, level-13, 8, 12, ['#dbab68','#c47c5a','#87a593','#d3c293'][(jar+shelf)%4]);
          rect(xx+1, level-15, 6, 3, '#dacba4');
        }
      }
      rect(101, 217, 52, 34, '#82654a');
      rect(22, 24, 212, 27, '#935042');
      rect(28, 28, 200, 2, '#efd39c');
      rect(28, 45, 200, 2, '#efd39c');
    }
    surfaceGrain(c, 256, 4500);
  });
}

// Hai mesh dùng chung cho toàn bộ cửa hàng và cửa sổ. UV nguyên ở mép
// mỗi mặt để cả nhà hẹp lẫn khối chợ đều có các ô cửa nguyên vẹn.
function buildStreetFacades(buildings) {
  function batch() { return { positions: [], colors: [], uvs: [], indices: [] }; }
  var shops = batch(), windows = batch();
  function face(data, a, b, bottom, top, bays, floors, tint) {
    var i = data.positions.length / 3;
    data.positions.push(a.x, bottom, a.z, b.x, bottom, b.z, b.x, top, b.z, a.x, top, a.z);
    data.uvs.push(0, 0, bays, 0, bays, floors, 0, floors);
    for (var j = 0; j < 4; j++) data.colors.push(tint.r, tint.g, tint.b);
    data.indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  var palette = [0xfff3d2, 0xf3ceab, 0xd8e9d5, 0xf9dbaf, 0xdde6cd, 0xffe4c6];
  buildings.forEach(function (b) {
    var c = Math.cos(b.rot), s = Math.sin(b.rot);
    var tint = new THREE.Color(palette[hashStr(b.id) % palette.length]);
    function corner(x, z) { return { x: b.x + c*x + s*z, z: b.z - s*x + c*z }; }
    var w = b.hw + 0.003, d = b.hd + 0.003;
    var corners = [corner(-w,d), corner(w,d), corner(w,-d), corner(-w,-d)];
    var shopHeight = Math.min(b.h, 0.92);
    for (var k = 0; k < 4; k++) {
      var a = corners[k], end = corners[(k + 1) % 4];
      var bays = Math.max(1, Math.round(Math.hypot(end.x-a.x, end.z-a.z) / 1.03));
      face(shops, a, end, 0.012, shopHeight, bays, 1, tint);
      if (b.h > shopHeight) face(windows, a, end, shopHeight, b.h, bays, Math.max(1, Math.round((b.h-shopHeight) / 0.86)), tint);
    }
  });
  function add(data, texture) {
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
    geo.setIndex(data.indices);
    geo.computeVertexNormals();
    var mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: texture, vertexColors: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1 }));
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  add(shops, facadeTexture(false));
  add(windows, facadeTexture(true));
}

// Cắt ngắn khoảng lùi camera nếu một nhà, thân cây hay cột đèn nằm giữa
// camera và người chơi. Chỉ tra những vật thể gần ô phố hiện tại.
var cameraCells = new Map();
function indexCameraObstacles(objects) {
  var transform = new THREE.Matrix4();
  objects.forEach(function (root) {
    root.updateMatrixWorld(true);
    root.traverse(function (mesh) {
      if (!mesh.isMesh || mesh.material.transparent) return;
      mesh.geometry.computeBoundingBox();
      var count = mesh.isInstancedMesh ? mesh.count : 1;
      for (var i = 0; i < count; i++) {
        if (mesh.isInstancedMesh) {
          mesh.getMatrixAt(i, transform);
          transform.premultiply(mesh.matrixWorld);
        } else transform.copy(mesh.matrixWorld);
        var box = mesh.geometry.boundingBox.clone().applyMatrix4(transform);
        if (box.min.y > 1.5 || box.max.y < 0.1) continue;
        var obstacle = { bounds: mesh.geometry.boundingBox, inverse: transform.clone().invert(), matrix: transform.clone() };
        for (var x = Math.floor((box.min.x-3)/8); x <= Math.floor((box.max.x+3)/8); x++) {
          for (var z = Math.floor((box.min.z-3)/8); z <= Math.floor((box.max.z+3)/8); z++) {
            var key = x + ':' + z;
            if (!cameraCells.has(key)) cameraCells.set(key, []);
            cameraCells.get(key).push(obstacle);
          }
        }
      }
    });
  });
}
function createStreetCamera() {
  var origin = new THREE.Vector3(), direction = new THREE.Vector3(), hit = new THREE.Vector3(), ray = new THREE.Ray();
  return function (pos, yaw) {
    var boom = innerWidth < innerHeight ? 2.65 : 2.25;
    origin.set(pos.x, 0.34, pos.z);
    direction.set(Math.sin(yaw)*boom, 0.82, Math.cos(yaw)*boom);
    var distance = direction.length();
    direction.normalize();
    var nearby = cameraCells.get(Math.floor(pos.x/8) + ':' + Math.floor(pos.z/8)) || [];
    nearby.forEach(function (o) {
      ray.set(origin, direction).applyMatrix4(o.inverse);
      if (ray.intersectBox(o.bounds, hit)) {
        distance = Math.min(distance, Math.max(0.22, origin.distanceTo(hit.applyMatrix4(o.matrix)) - 0.12));
      }
    });
    camera.position.copy(origin).addScaledVector(direction, distance);
    camera.lookAt(pos.x, 0.34 + 0.22 * Math.min(1, distance/boom), pos.z);
  };
}

function addMarketSigns(buildings) {
  buildings.forEach(function (b) {
    if (!b.name || !b.name.startsWith('Chợ ')) return;
    var board = streetTexture(512, 96, function (c) {
      c.fillStyle = '#864437';
      c.fillRect(0, 0, 512, 96);
      c.strokeStyle = '#edcc92';
      c.lineWidth = 3;
      c.strokeRect(6, 6, 500, 84);
      c.font = 'bold 46px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#fff1cc';
      c.fillText(b.name.toLocaleUpperCase('vi'), 256, 48, 468);
    });
    var material = new THREE.MeshStandardMaterial({ map: board, roughness: 0.84, emissive: 0x331909 });
    for (var side = 0; side < 4; side++) {
      var width = Math.min(2.65, (side % 2 ? b.hd : b.hw) * 1.76);
      if (width < 0.8) continue;
      var angle = b.rot + side * Math.PI / 2;
      var depth = (side % 2 ? b.hw : b.hd) + 0.018;
      var sign = new THREE.Mesh(new THREE.PlaneGeometry(width, width*0.135), material);
      sign.rotation.y = angle;
      sign.position.set(b.x + Math.sin(angle)*depth, 0.995, b.z + Math.cos(angle)*depth);
      scene.add(sign);
    }
  });
}
