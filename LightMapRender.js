var LightMapRenderer = function(scene,callback){
	this.scene = scene.clone();
	this.originalScene = scene;
	this.callback = callback;
	this.renderer = new THREE.WebGLRenderer();

	this.renderer.setSize(512 ,512);
	this.renderer.domElement.style.position = "absolute";
	this.renderer.domElement.style.bottom = "0";
	this.renderer.setClearColor(new THREE.Color(0,0,0), 1);
	document.body.appendChild(this.renderer.domElement);

	this.viewScene = new THREE.Scene();
	this.viewCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
	this.viewCamera.position.set( 0, 0, 1 );

	var quad = new THREE.PlaneBufferGeometry( 2 , 2 );
	var viewMaterial = new THREE.ShaderMaterial({
		uniforms : {
			buffer : { value : null },
		},
		vertexShader : ShaderLib.debugVertexShader,
		fragmentShader : ShaderLib.debugFragmentShader
	});

	this.viewQuad = new THREE.Mesh(quad, viewMaterial);
	this.viewScene.add(this.viewQuad);

	this.frame = { value : 1 };


	this.merageScene = new THREE.Scene();
	var merageQuad = new THREE.PlaneBufferGeometry( 2 , 2 );
	this.merageFrame = 1;

	var merageMaterial = new THREE.ShaderMaterial({
		uniforms : {
			buffer1 : { value : null },
			buffer2 : { value : null },
			res : { value : new THREE.Vector2(1024, 1024)},
			frame : { value : this.merageFrame } 
		},
		vertexShader : ShaderLib.debugVertexShader,
		fragmentShader : ShaderLib.merageFragmentShader
	});

	this.merageQuad = new THREE.Mesh(merageQuad, merageMaterial);

	this.merageScene.add(this.merageQuad);

}


LightMapRenderer.prototype = {

	genUV2 : function(){
		var child, geometry, x, y, offsetX, offsetY;
		var defaultWidth = defaultHeight = 170;
		var c = 0, padding = 2;
		var u, v, u2, v2, uv, uv2;
		for(var i = 0, l = this.scene.children.length; i < l; i ++ ){
			child = this.scene.children[i];
			if(child.isMesh){
				geometry = child.geometry;
				x = c % 6;
				y = Math.floor( c / 6 );
				uv = geometry.attributes.uv.array;
				uv2 = [];
				for(var n = 0 , m = uv.length; n < m; n++){
					u = uv[n];
					v = uv[++n];
					u2 = ((u * ( defaultWidth - 4 )) + ( x * defaultWidth ) + 2 )/1024;
					v2 = ((v * ( defaultHeight - 4 )) + ( y * defaultHeight ) + 2 )/1024;
					uv2.push(u2, v2);
				}

				geometry.addAttribute('uv2', new THREE.Float32BufferAttribute(uv2, 2));
				this.originalScene.children[i].geometry.addAttribute('uv2', new THREE.Float32BufferAttribute(uv2, 2));
				c += 1;
			}	
		}
	},

	genTriangleUniform : function(){
		var uniforms = [];
		for(var i = 0, l = this.scene.children.length; i < l ; i ++){
			child = this.scene.children[i];
			if(child.isMesh){

				var meshUniforms = this.genMeshUniforms(child);
				uniforms = uniforms.concat(meshUniforms);
				
			}else if(child.isPointLight){
				this.light = child;
			}
		}
		console.log(uniforms);
		return uniforms;
	},
	genMeshUniforms : function(mesh){
		var child, geometry, positions, normals, indices, uv2, worldMatrix;
		var ii, il, i1, i2, i3, pos1, pos2, pos3, nor, uv21, uv22, uv23;

		var uniforms = [];

		geometry = mesh.geometry;
		normals = geometry.attributes.normal;
		positions = geometry.attributes.position;
		indices = geometry.index;
		uv2 = geometry.attributes.uv2;
		//need to fix martix and martixWorld
		worldMatrix = mesh.matrix.elements;

		il = indices.count;
		for(ii = 0; ii < il; ii++){
			i1 = indices.array[ii];
			i2 = indices.array[++ii];
			i3 = indices.array[++ii];

			pos1 = this.localToWorld( [positions.array[i1*3], positions.array[i1*3+1], positions.array[i1*3+2]], worldMatrix );
			pos2 = this.localToWorld( [positions.array[i2*3], positions.array[i2*3+1], positions.array[i2*3+2]], worldMatrix );
			pos3 = this.localToWorld( [positions.array[i3*3], positions.array[i3*3+1], positions.array[i3*3+2]], worldMatrix );


			// nor = (new THREE.Vector3(normals.array[i1*3], normals.array[i1*3+1], normals.array[i1*3+2];)).applyMatrix4 ( worldMatrix );
			nor = this.normalToWorld( [normals.array[i1*3], normals.array[i1*3+1], normals.array[i1*3+2]], mesh.matrix.clone() );
			uv21 = [uv2.array[i1*2], uv2.array[i1*2+1]];
			uv22 = [uv2.array[i2*2], uv2.array[i2*2+1]];
			uv23 = [uv2.array[i3*2], uv2.array[i3*2+1]];

			uniforms.push(this.createTri( pos1, pos2, pos3, nor, uv21, uv22, uv23));
		}
		return uniforms;
	},
	localToWorld : function(pos , e){
		var w = 1 / ( e[ 3 ] * pos[0] + e[ 7 ] * pos[1] + e[ 11 ] * pos[2] + e[ 15 ] );
		var worldPos = [
			( e[ 0 ] * pos[0] + e[ 4 ] * pos[1] + e[ 8 ] * pos[2] + e[ 12 ] ) * w,
			( e[ 1 ] * pos[0] + e[ 5 ] * pos[1] + e[ 9 ] * pos[2] + e[ 13 ] ) * w,
			( e[ 2 ] * pos[0] + e[ 6 ] * pos[1] + e[ 10 ] * pos[2] + e[ 14 ] ) * w
		];

		return worldPos;

	},
	normalToWorld : function(normal, matrix){
		var tmp =  new THREE.Matrix4();
		tmp = tmp.getInverse(matrix).transpose();
		return this.localToWorld(normal, tmp.elements);
	},
	createTri : function(pos1, pos2, pos3, nor, uv21, uv22, uv23){

		var tri = {
			pos1 : new THREE.Vector3(pos1[0], pos1[1], pos1[2]),
			pos2 : new THREE.Vector3(pos2[0], pos2[1], pos2[2]),
			pos3 : new THREE.Vector3(pos3[0], pos3[1], pos3[2]),

			nor : Array.isArray(nor)?new THREE.Vector3(nor[0], nor[1], nor[2]):nor,

			uv21 : new THREE.Vector2(uv21[0], uv21[1]),
			uv22 : new THREE.Vector2(uv22[0], uv22[1]),
			uv23 : new THREE.Vector2(uv23[0], uv23[1]),
		};
		return tri;

	},

	bakeLightMap : function(){

		this.genUV2();
		this.uniforms = this.genTriangleUniform();
		var directLightMapMaterial = new THREE.ShaderMaterial({
			uniforms : {
				light : {
					value : {
						position : this.light.position,
						color : this.light.color,
						distance : this.light.distance?this.light.distance:20
					}
				},
				tris : { 
					value : this.uniforms
				},
			},
			vertexShader : ShaderLib.vertexShader,
			fragmentShader : ShaderLib.lightMapFragmentShader1,
		});

		var child;
		for(var i = 0, l = this.scene.children.length; i < l; i++ ){
			child = this.scene.children[i];
			if(child.isMesh){
				child.material = directLightMapMaterial;
			}
		}

		this.directLightMapBuffer = new THREE.WebGLRenderTarget( 1024, 1024, {
			wrapS: THREE.RepeatWrapping,
			wrapT: THREE.RepeatWrapping,
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter,
			format: THREE.RGBAFormat,
			type: THREE.FloatType,
			stencilBuffer: false,
			depthBuffer: false
		});

		this.renderer.render(this.scene, this.viewCamera, this.directLightMapBuffer);

		this.viewQuad.material.uniforms.buffer.value = this.directLightMapBuffer.texture;
		this.renderer.render(this.viewScene, this.viewCamera);

		this.lightMapBuffer = this.directLightMapBuffer;

		//indirectlight pass;

		this.indirectLightMapMaterial = new THREE.ShaderMaterial({
			uniforms : {
				resolution :{ value : new THREE.Vector2(1024, 1024)},
				frame : this.frame,
				lightBuffer : { value : this.lightMapBuffer.texture},
				tris : { 
					value : this.uniforms
				},
			},
			vertexShader : ShaderLib.vertexShader,
			fragmentShader : ShaderLib.lightMapFragmentShader2,
		});

		for(var i = 0, l = this.scene.children.length; i < l; i++ ){
			child = this.scene.children[i];
			if(child.isMesh){
				child.material = this.indirectLightMapMaterial;
			}
		}

		this.writeBuffer = new THREE.WebGLRenderTarget( 1024, 1024, {
			wrapS: THREE.RepeatWrapping,
			wrapT: THREE.RepeatWrapping,
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter,
			format: THREE.RGBAFormat,
			type: THREE.FloatType,
			stencilBuffer: false,
			depthBuffer: false
		});


		this.lightWriteBuffer = this.writeBuffer.clone();
		
		// this.indirectLightPass();


	},
	indirectLightPass : function(){

		this.renderer.render(this.scene, this.viewCamera, this.writeBuffer);
		this.indirectLightMapMaterial.uniforms.frame.value += 1;

		this.lightWriteBuffer = this.merageBuffer(this.writeBuffer, this.lightMapBuffer, this.lightWriteBuffer);

		var temp = this.lightWriteBuffer;
		this.lightWriteBuffer = this.lightMapBuffer;
		this.lightMapBuffer = temp;

		this.viewQuad.material.uniforms.buffer.value = this.lightMapBuffer.texture;

		this.indirectLightMapMaterial.uniforms.lightBuffer.value = this.lightMapBuffer.texture;

		this.renderer.render(this.viewScene, this.viewCamera);

		if(this.frame.value >= 200){
			var scene = this.originalScene;
			this.lightMapBuffer.texture.flipY = false;
			for(var i = 0, l = scene.children.length; i < l; i++){
				var child = scene.children[i];

				if(child.isMesh){
					child.material.lightMap = this.lightMapBuffer.texture;
					child.material.needUpdate = true;
				}else if(child.isPointLight){
					scene.remove(child);
					break;
				}
			}
			this.callback();
			return;
		}
		var self = this;
		requestAnimationFrame(function(){
			self.indirectLightPass();
		});
	},

	merageBuffer : function(buffer1 , buffer2, buffer3){

		this.merageQuad.material.uniforms.buffer1.value = buffer1.texture;
		this.merageQuad.material.uniforms.buffer2.value = buffer2.texture;
		this.merageQuad.material.uniforms.frame.value = this.merageFrame;

		this.renderer.render(this.merageScene, this.viewCamera, buffer3);
		this.merageFrame++;


		return buffer3;

	},
	exportScene : function(){
		var gltfExporter = new THREE.GLTFExporter();

		var link = document.createElement( 'a' );
		link.download = 'scene.gltf';

		gltfExporter.parse( this.scene, function( result ) {
			var output = JSON.stringify( result, null, 2 );
			var blob = new Blob( [ output ], { type: 'text/plain' } );
			link.href = URL.createObjectURL( blob );
			
			link.click();
			
		}, {} );
	},
	restoreScene : function(){

	},

	DirectLightMapRender : function(light){
		
	}

}