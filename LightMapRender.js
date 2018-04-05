var LightMapRenderer = function(scene,callback){
	this.scene = scene;
	this.callback = callback;
	this.renderer = new THREE.WebGLRenderer();

	this.materialsCache = {};

	this.pointLights = [];
	this.directionalLights = [];
	this.spotLights = [];
	this.emissiveMaps = [];

	this.currentDirectLight = null;

	this.uv2 = new UV2();

	this.uniformArrayStep = 20;
	this.uniformArray = [];

	this.meshs = [];

	this.renderer.setSize(512 ,512);
	this.renderer.domElement.style.position = "absolute";
	this.renderer.domElement.style.bottom = "0";
	this.renderer.domElement.style.left = "0";
	this.renderer.setClearColor(new THREE.Color(0,0,0), 1);
	document.body.appendChild(this.renderer.domElement);

	this.viewScene = new THREE.Scene();
	this.viewScene.background = new THREE.Color(0,0,0);
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



	this.merageScene = new THREE.Scene();
	var merageQuad = new THREE.PlaneBufferGeometry( 2 , 2 );
	this.merageFrame = 1;

	var merageMaterial = new THREE.ShaderMaterial({
		uniforms : {
			buffer1 : { value : null },
			buffer2 : { value : null },
			res : { value : null},
			frame : { value : this.merageFrame } 
		},
		vertexShader : ShaderLib.debugVertexShader,
		fragmentShader : ShaderLib.merageFragmentShader
	});

	this.merageQuad = new THREE.Mesh(merageQuad, merageMaterial);
	this.merageScene.add(this.merageQuad);

}


LightMapRenderer.prototype = {

	init : function(){
		var scene = this.scene;
		for(var i = 0, l = scene.children.length; i < l ; i ++){
			var child = scene.children[i];
			if(child.isMesh){
				//gen uv2
				this.uv2.addUV2(child);

				//cache materials
				this.materialsCache[child.uuid] = child.material;

				if(child.material.emissiveMap != null){
					this.emissiveMaps = child;
				}
				this.meshs.push(child);
			}else if(child.isPointLight){
				this.pointLights.push(child);
			}else if(child.isDirectionalLight){
				this.directionalLights.push(child);
			}else if(child.isSpotLight){
				this.spotLights.push(child);
			}
		}

		this.uv2.uvWrap();

		this.width = this.uv2.mapWidth;
		this.height = this.uv2.mapHeight;

		this.merageQuad.material.uniforms.res.value = new THREE.Vector2(this.width, this.height);

		this.diffuseMapOutput();

		//this.MRAMapOutput();// output metalness roughness and alpha

		var data = new Float32Array( 4 );
		data[0] = 0;data[1] = 0;data[2] = 0;data[3] = 0;
		this.occlusionDefaultTexture = new THREE.DataTexture( data, 1, 1, THREE.RGBAFormat, THREE.FloatType );



		var textureData = new Float32Array( 4 );
		textureData[0] = 0;textureData[1] = 0;textureData[2] = 0;textureData[3] = 1;
		this.indirectLightingDefaultTexture = new THREE.DataTexture( textureData, 1, 1, THREE.RGBAFormat, THREE.FloatType );

		this.directLightingWriteBuffer = new THREE.WebGLRenderTarget( this.width, this.height, {
			wrapS: THREE.RepeatWrapping,
			wrapT: THREE.RepeatWrapping,
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter,
			format: THREE.RGBAFormat,
			type: THREE.FloatType,
			stencilBuffer: false,
			depthBuffer: false
		});
		this.directLightingReadBuffer = this.directLightingWriteBuffer.clone();

		this.lightmapWriteBuffer = new THREE.WebGLRenderTarget( this.width, this.height, {
			wrapS: THREE.RepeatWrapping,
			wrapT: THREE.RepeatWrapping,
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter,
			format: THREE.RGBAFormat,
			type: THREE.FloatType,
			stencilBuffer: false,
			depthBuffer: false
		});
		this.lightmapReadBuffer = this.lightmapWriteBuffer.clone();

		this.indirectLightingWriteBuffer = null;
		this.indirectLightingReadBuffer = null;

		this.genTriangleUniform();
		this.renderFlag = LightMapRenderer.directLighting;

		this.indirectLightingPass = 1;
	},


	bakeLightMap : function(){
		this.init();
		this.render();
		
	},
	render : function(){
		var self = this;
		if(this.renderFlag === LightMapRenderer.directLighting){
			if(this.currentDirectLight === null){
				if(this.pointLights.length > 0){
					this.currentDirectLight = this.pointLights.pop();
				}else if(this.directionalLights.length > 0){
					this.currentDirectLight = this.directionalLights.pop();
				}else if(this.spotLights.length > 0){
					this.currentDirectLight = this.spotLights.pop();
				}else if(this.emissiveMaps.length > 0){
					//TODO::handle emissivemap
				}else{
					//direct lighting finished;
					this.renderFlag = LightMapRenderer.indirectLighting;
					this.directLightingWriteBuffer.dispose();
					this.directLightingWriteBuffer = null;

					console.log('Indirect lighting start');
					this.indirectLightingWriteBuffer = new THREE.WebGLRenderTarget( this.width, this.height, {
						wrapS: THREE.RepeatWrapping,
						wrapT: THREE.RepeatWrapping,
						minFilter: THREE.NearestFilter,
						magFilter: THREE.NearestFilter,
						format: THREE.RGBAFormat,
						type: THREE.FloatType,
						stencilBuffer: false,
						depthBuffer: false
					});

					this.indirectLightingReadBuffer = this.indirectLightingWriteBuffer.clone();

					requestAnimationFrame(function(){
						self.render();
					});
					return;

				}
			}
			if(this.currentDirectLight.isPointLight){
				this.pointLightDirectLighting();
			}else if(this.currentDirectLight.isDirectionalLight){
				this.directionalLightDirectLighting();
			}else if(this.currentDirectLight.isSpotLight){
				this.spotLightDirectLighting();
			}
		}else{
			if(this.indirectLightingPass > 10){
				// this.debug(this.lightmapReadBuffer);

				// denoise
				this.viewQuad.material = new THREE.ShaderMaterial({
					uniforms : {
						buffer : { value : this.lightmapReadBuffer.texture },
						resolution : {value : new THREE.Vector2(this.width, this.height)},
					},
					vertexShader : ShaderLib.debugVertexShader,
					fragmentShader : ShaderLib.denoiseFragmentShader,
				})

				this.renderer.setSize(this.width, this.height);
				this.renderer.render(this.viewScene, this.viewCamera);
				console.log('Bake complete');
				return;
			}else{
				this.indirectLighting();
				// this.debug(this.lightmapReadBuffer);
			}
		}
		
		
		
		this.debug(this.lightmapReadBuffer);
		requestAnimationFrame(function(){
			self.render();
		});
	},

	genTriangleUniform : function(){
		var uniforms = [];
		for(var i = 0, l = this.scene.children.length; i < l ; i ++){
			child = this.scene.children[i];
			if(child.isMesh){

				var meshUniforms = this.genMeshUniforms(child);
				uniforms = uniforms.concat(meshUniforms);
				
			}
		}

		var stepArray = [];
		while(true){
			stepArray = uniforms.splice(0, this.uniformArrayStep);
			if(stepArray.length > 0){
				this.uniformArray.push(stepArray);	
			}else{
				break;
			}
			
		}

		return;
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

	pointLightDirectLighting : function(){
		var light = this.currentDirectLight;
		if(light.uniformArrayOffset == undefined){
			light.uniformArrayOffset = 0;
		}
		if(light.uniformArrayOffset == this.uniformArray.length){
			this.currentDirectLight = null;

			this.merageBuffer(this.directLightingReadBuffer, this.lightmapReadBuffer, this.lightmapWriteBuffer);
			
			this.swapLightMapBuffer();

			return;
		}

		var directLightMapMaterial = new THREE.ShaderMaterial({
			uniforms : {
				light : {
					value : {
						position : this.currentDirectLight.position,
						color : this.currentDirectLight.color,
						distance : this.currentDirectLight.distance?this.currentDirectLight.distance:20
					}
				},
				tris : { 
					value : this.uniformArray[light.uniformArrayOffset]
				},
				buffer : { value : light.uniformArrayOffset === 0 ? this.occlusionDefaultTexture : this.directLightingReadBuffer.texture }
			},
			vertexShader : ShaderLib.vertexShader,
			fragmentShader : ShaderLib.pointLightDirectLightingFragmentShader,
		});

		var i, l, child;
		for(i = 0, l = this.meshs.length; i < l; i++){
			child = this.meshs[i];
			child.material = directLightMapMaterial;
		}

		this.renderer.render(this.scene, this.viewCamera, this.directLightingWriteBuffer);

		var temp = this.directLightingWriteBuffer;
		this.directLightingWriteBuffer = this.directLightingReadBuffer;
		this.directLightingReadBuffer = temp;
		light.uniformArrayOffset++;
	},

	directionalLightDirectLighting : function(){
		this.currentDirectLight = null;
	},
	spotLightDirectLighting : function(){
		this.currentDirectLight = null;
	},

	indirectLighting : function(){

		this.indirectLightingUniformArrayOffset = this.indirectLightingUniformArrayOffset || 0;
		if(this.indirectLightingUniformArrayOffset >= this.uniformArray.length ){
			this.indirectLightingUniformArrayOffset = 0;
			this.indirectLightingPass++;
			this.merageBuffer(this.indirectLightingReadBuffer, this.lightmapReadBuffer, this.lightmapWriteBuffer);
			this.swapLightMapBuffer();
			return;
		}

		var indirectLightMapMaterial = new THREE.ShaderMaterial({
			uniforms : {
				resolution :{ value : new THREE.Vector2(this.width, this.height)},
				frame : this.indirectLightingPass,
				lightBuffer : { value : this.directLightingReadBuffer.texture },
				diffuseBuffer : { value : this.diffuseBuffer.texture },
				indirectLightingBuffer : { value : this.indirectLightingUniformArrayOffset == 0 ? this.indirectLightingDefaultTexture: this.indrectLightingReadBuffer.texture },
				tris : { 
					value : this.uniformArray[this.indirectLightingUniformArrayOffset]
				},
			},
			vertexShader : ShaderLib.vertexShader,
			fragmentShader : ShaderLib.indirectLightingFragmentShader,
		});

		var i, l, child;
		for(i = 0, l = this.meshs.length; i < l ; i++){
			child = this.meshs[i];
			child.material = indirectLightMapMaterial;
		}

		this.renderer.render(this.scene, this.viewCamera, this.indirectLightingWriteBuffer);

		var temp = this.indirectLightingWriteBuffer;
		this.indirectLightingWriteBuffer = this.indirectLightingReadBuffer;
		this.indirectLightingReadBuffer = temp;

		this.indirectLightingUniformArrayOffset++;
	},

	swapLightMapBuffer : function(){
		var temp = this.lightmapReadBuffer;
		this.lightmapReadBuffer = this.lightmapWriteBuffer;
		this.lightmapWriteBuffer = temp;
	},

	// bakeLightMap2 : function(){
	// 	this.beginTime = Date.now();

	// 	this.genUV2();

	// 	this.diffuseMapOutput();
	// 	// this.uniforms = this.genTriangleUniform();
	// 	var directLightMapMaterial = new THREE.ShaderMaterial({
	// 		uniforms : {
	// 			light : {
	// 				value : {
	// 					position : this.light.position,
	// 					color : this.light.color,
	// 					distance : this.light.distance?this.light.distance:20
	// 				}
	// 			},
	// 			tris : { 
	// 				value : this.uniforms
	// 			},
	// 		},
	// 		vertexShader : ShaderLib.vertexShader,
	// 		fragmentShader : ShaderLib.pointLightDirectLightingFragmentShader,
	// 	});

	// 	var child;
	// 	for(var i = 0, l = this.scene.children.length; i < l; i++ ){
	// 		child = this.scene.children[i];
	// 		if(child.isMesh){
	// 			child.material = directLightMapMaterial;
	// 		}
	// 	}


	// 	this.cacheMaterials();

	// 	this.directLightMapBuffer = new THREE.WebGLRenderTarget( 1024, 1024, {
	// 		wrapS: THREE.RepeatWrapping,
	// 		wrapT: THREE.RepeatWrapping,
	// 		minFilter: THREE.NearestFilter,
	// 		magFilter: THREE.NearestFilter,
	// 		format: THREE.RGBAFormat,
	// 		type: THREE.FloatType,
	// 		stencilBuffer: false,
	// 		depthBuffer: false
	// 	});

	// 	this.renderer.render(this.scene, this.viewCamera, this.directLightMapBuffer);

	// 	this.viewQuad.material.uniforms.buffer.value = this.directLightMapBuffer.texture;
	// 	this.renderer.render(this.viewScene, this.viewCamera);

	// 	this.lightMapBuffer = this.directLightMapBuffer;

	// 	//indirectlight pass;

	// 	this.indirectLightMapMaterial = new THREE.ShaderMaterial({
	// 		uniforms : {
	// 			resolution :{ value : new THREE.Vector2(1024, 1024)},
	// 			frame : this.frame,
	// 			lightBuffer : { value : this.directLightMapBuffer.texture },
	// 			diffuseBuffer : { value : this.diffuseBuffer.texture },
	// 			tris : { 
	// 				value : this.uniforms
	// 			},
	// 		},
	// 		vertexShader : ShaderLib.vertexShader,
	// 		fragmentShader : ShaderLib.indirectLightingFragmentShader,
	// 	});

	// 	for(var i = 0, l = this.scene.children.length; i < l; i++ ){
	// 		child = this.scene.children[i];
	// 		if(child.isMesh){
	// 			child.material = this.indirectLightMapMaterial;
	// 		}
	// 	}

	// 	this.writeBuffer = new THREE.WebGLRenderTarget( 1024, 1024, {
	// 		wrapS: THREE.RepeatWrapping,
	// 		wrapT: THREE.RepeatWrapping,
	// 		minFilter: THREE.NearestFilter,
	// 		magFilter: THREE.NearestFilter,
	// 		format: THREE.RGBAFormat,
	// 		type: THREE.FloatType,
	// 		stencilBuffer: false,
	// 		depthBuffer: false
	// 	});


	// 	this.lightWriteBuffer = this.writeBuffer.clone();
		
	// 	this.indirectLightPass();


	// },
	// indirectLightPass : function(){

	// 	this.renderer.render(this.scene, this.viewCamera, this.writeBuffer);
	// 	this.indirectLightMapMaterial.uniforms.frame.value += 1;

	// 	this.lightWriteBuffer = this.merageBuffer(this.writeBuffer, this.lightMapBuffer, this.lightWriteBuffer);

	// 	var temp = this.lightWriteBuffer;
	// 	this.lightWriteBuffer = this.lightMapBuffer;
	// 	this.lightMapBuffer = temp;

	// 	this.viewQuad.material.uniforms.buffer.value = this.lightMapBuffer.texture;

	// 	this.indirectLightMapMaterial.uniforms.lightBuffer.value = this.lightMapBuffer.texture;

	// 	this.renderer.render(this.viewScene, this.viewCamera);

	// 	if(this.frame.value >= 10){
	// 		// this.lightMapBuffer.texture.flipY = false;
			
	// 		this.lightMapBuffer.needsUpdate = true;

	// 		// this.denoise();

	// 		// denoise
	// 		this.viewQuad.material = new THREE.ShaderMaterial({
	// 			uniforms : {
	// 				buffer : { value : this.lightMapBuffer.texture },
	// 				resolution : {value : new THREE.Vector2(1024, 1024)},
	// 			},
	// 			vertexShader : ShaderLib.debugVertexShader,
	// 			fragmentShader : ShaderLib.denoiseFragmentShader,
	// 		})

	// 		this.renderer.setSize(1024, 1024);
	// 		this.renderer.render(this.viewScene, this.viewCamera);

	// 		this.restoreScene(this.lightMapBuffer.texture);
	// 		this.callback();
	// 		console.log('end');

	// 		this.endTime = Date.now();
	// 		console.log(this.endTime - this.beginTime);
	// 		return;
	// 	}
	// 	var self = this;
	// 	requestAnimationFrame(function(){
	// 		self.indirectLightPass();
	// 	});
	// },

	merageBuffer : function(buffer1 , buffer2, buffer3){

		this.merageQuad.material.uniforms.buffer1.value = buffer1.texture;
		this.merageQuad.material.uniforms.buffer2.value = buffer2.texture;
		this.merageQuad.material.uniforms.frame.value = this.merageFrame;

		this.renderer.render(this.merageScene, this.viewCamera, buffer3);
		this.merageFrame++;


		return buffer3;

	},
	
	
	restoreScene : function(lightMap){
		var scene = this.scene;
		var child;
		for(var i = 0 , l = scene.children.length; i < l ; i++){
			child = scene.children[i];
			if(child instanceof THREE.Object3D){
				if(child.isMesh){
					child.material = this.materialsCache[child.uuid];
					if(lightMap !== undefined)
					child.material.lightMap = lightMap;
					child.material.needUpdate = true;
				}else if(child.isPointLight){
					scene.remove(child);
				}
			}
		}

	},
	diffuseMapOutput : function(){
		var scene = this.scene;
		var child;

		function genDiffuseShader(material){
			var fragmentShader = [];
			var uniforms = {};
			if(material.map){
				fragmentShader.push('#define USE_MAP');
				uniforms.diffuseMap = { value : material.map } ;
			}else if(material.color){
				fragmentShader.push('#define USE_COLOR');
				uniforms.uColor = { value : material.color } ;
			}

			fragmentShader.push(ShaderLib.diffuseOutputShader);

			fragmentShader = fragmentShader.join("\n");

			// console.log(fragmentShader);return;
			var material = new THREE.ShaderMaterial({
				uniforms : uniforms,
				vertexShader : ShaderLib.vertexShader,
				fragmentShader : fragmentShader
			});
			return material;
		}

		for(var i = 0 , l = this.meshs.length; i < l ; i++){
			child = this.meshs[i];
			child.material = genDiffuseShader(child.material);
			
		}


		this.diffuseBuffer = new THREE.WebGLRenderTarget( 512, 512, {
			wrapS: THREE.RepeatWrapping,
			wrapT: THREE.RepeatWrapping,
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter,
			format: THREE.RGBAFormat,
			type: THREE.FloatType,
			stencilBuffer: false,  
			depthBuffer: false
		});
		this.renderer.render(this.scene, this.viewCamera, this.diffuseBuffer);
	},

	MRAMapOutput: function(){
		var scene = this.scene;
		var child;

		function genMRAShader(material){
			var fragmentShader = [];
			var uniforms = {};
			if(material.metalnessMap ){
				fragmentShader.push('#define USE_METALNESS_MAP');
				uniforms.metalnessMap = { value : material.metalnessMap } ;
			}
			if(material.metalness){
				fragmentShader.push('#define USE_METALNESS');
				uniforms.uMetalness = { value : material.metalness } ;
			}

			if(material.roughnessMap){
				fragmentShader.push('#define USE_ROUGHNESS_MAP');
				uniforms.roughnessMap = { value : material.roughnessMap } ;
			}
			if(material.roughness){
				fragmentShader.push('#define USE_ROUGHNESS');
				uniforms.uRoughness = { value : material.roughness } ;
			}

			if(material.alphaMap){
				fragmentShader.push('#define USE_ALPHA_MAP');
				uniforms.alphaMap = { value : material.alphaMap } ;
			}

			if(material.opacity < 1){
				fragmentShader.push('#define USE_OPACITY');
				uniforms.uOpacity = { value : material.opacity } ;
			}
			

			fragmentShader.push(ShaderLib.diffuseOutputShader);
			fragmentShader = fragmentShader.join("\n");

			// console.log(fragmentShader);return;
			var material = new THREE.ShaderMaterial({
				uniforms : uniforms,
				vertexShader : ShaderLib.vertexShader,
				fragmentShader : fragmentShader
			});

			return material;
		}

		for(var i = 0 , l = scene.children.length; i < l ; i++){
			child = scene.children[i];
			if(child instanceof THREE.Object3D){
				if(child.isMesh){
					child.material = genMRAShader(this.materialsCache[child.uuid]);
				}
			}
		}

		this.MRABuffer = new THREE.WebGLRenderTarget( 512, 512, {
			wrapS: THREE.RepeatWrapping,
			wrapT: THREE.RepeatWrapping,
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter,
			format: THREE.RGBAFormat,
			type: THREE.FloatType,
			stencilBuffer: false,  
			depthBuffer: false
		});
		this.renderer.render(this.scene, this.viewCamera, this.MRABuffer);

		
	},

	debug: function( buffer ){
		this.viewQuad.material.uniforms.buffer.value = buffer.texture;
		this.renderer.render(this.viewScene, this.viewCamera);
		return;
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
	}

}

LightMapRenderer.directLighting = 0;
LightMapRenderer.indirectLighting = 1;