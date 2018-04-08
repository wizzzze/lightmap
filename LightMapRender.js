var LightMapRenderer = function(scene,callback){

	this.isBaking = false;
	this.indirectLightingMaxPass = 5;

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

	//profiler
	this.directTimer = [];
	this.indirectTimer;


	this.renderer.setSize(512 ,512);
	this.renderer.domElement.style.position = "absolute";
	this.renderer.domElement.style.bottom = "0";
	this.renderer.domElement.style.left = "0";
	// this.renderer.setClearColor(new THREE.Color( 0 , 0 , 0 ), 1);
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
	test : function(){

		var scene = this.scene;
		for(var i = 0, l = scene.children.length; i < l ; i ++){
			var child = scene.children[i];
			if(child.isMesh){
				//gen uv2
				this.uv2.addUV2(child);
			}
		}

		this.uv2.uvWrap();
		for(var i = 0, l= Editor.scene.scene.children[7].geometry.attributes.uv2.array.length; i < l ;i++){
			var n = i;
		    var u = Editor.scene.scene.children[7].geometry.attributes.uv.array[i];
		    var v = Editor.scene.scene.children[7].geometry.attributes.uv.array[++i];
		    var u2 = Editor.scene.scene.children[7].geometry.attributes.uv2.array[n];
		    var v2 = Editor.scene.scene.children[7].geometry.attributes.uv2.array[++n];
		    if(u > 0 && u < 0.5 && v > 0 && v < 0.5){
		    	console.log(' uv in the space');
		    }

		    if(u2 > 0.5 && u2 < 0.75 && v2 > 0.5 && v2 < 0.75){
		    	console.log(n);
		    }
		}
	},
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


		this.renderer.setSize(this.width ,this.height);

		this.merageQuad.material.uniforms.res.value = new THREE.Vector2(this.width, this.height);

		this.diffuseMapOutput();

		//this.MRAMapOutput();// output metalness roughness and alpha

		var data = new Float32Array( 4 );
		data[0] = 0;data[1] = 0;data[2] = 0;data[3] = 0;
		// data[4] = 0;data[5] = 0;data[6] = 0;data[7] = 0;
		// data[8] = 0;data[9] = 0;data[10] = 0;data[11] = 0;
		// data[12] = 0;data[13] = 0;data[14] = 0;data[15] = 0;
		this.occlusionDefaultTexture = new THREE.DataTexture( data, 1, 1, THREE.RGBAFormat, THREE.FloatType );

		var textureData = new Float32Array( 4 );
		textureData[0] = 0;textureData[1] = 0;textureData[2] = 0;textureData[3] = 1;
		this.indirectLightingDefaultTexture = new THREE.DataTexture( textureData, 1, 1, THREE.RGBAFormat, THREE.FloatType );

		this.directLightingWriteBuffer = new THREE.WebGLRenderTarget( this.width, this.height, {
			wrapS: THREE.ClampToEdgeWrapping,
			wrapT: THREE.ClampToEdgeWrapping,
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter,
			format: THREE.RGBAFormat,
			type: THREE.FloatType,
			stencilBuffer: false,
			depthBuffer: false
		});
		this.directLightingReadBuffer = this.directLightingWriteBuffer.clone();

		this.lightmapWriteBuffer = new THREE.WebGLRenderTarget( this.width, this.height, {
			wrapS: THREE.ClampToEdgeWrapping,
			wrapT: THREE.ClampToEdgeWrapping,
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
		this.isBaking = true;
		this.startTime = Date.now();
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
					this.indirectTimer = Date.now();
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

			// this.isBaking = false;
			// this.renderer.setSize(this.width, this.height);

			// this.debug(this.lightmapReadBuffer);
			// return;
			if(this.indirectLightingPass > 5){
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
				this.renderer.render(this.viewScene, this.viewCamera, this.lightmapWriteBuffer);
				this.swapLightMapBuffer();
				this.endTime = Date.now();
				this.restoreScene();
				this.debug(this.lightmapReadBuffer);
				this.callback(this.scene);

				console.log('IndirectLighting complete:'+(this.endTime - this.indirectTimer)/1000+'s');
				console.log('Mission complete:'+(this.endTime - this.startTime)/1000+'s');
				return;
			}else{
				this.debug(this.lightmapReadBuffer);
				this.indirectLighting();
			}
		}
		
		// this.debug(this.lightmapReadBuffer);
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
				if(meshUniforms != false)
					uniforms = uniforms.concat(meshUniforms);
				
			}
		}

		var stepArray = [];
		while(true){
			stepArray = uniforms.splice(0, this.uniformArrayStep);
			// if(stepArray.length > 0){
			if(stepArray.length == this.uniformArrayStep){
				this.uniformArray.push(stepArray);	
			}else if(stepArray.length > 0){
				var tmp = [0,0,0];
				var tri = this.createTri( tmp, tmp, tmp, tmp, tmp, tmp, tmp);
				while(stepArray.length < this.uniformArrayStep){
					stepArray.push(tri);
				}
				this.uniformArray.push(stepArray);
				break;
			}else{
				break;
			}
			
		}

		return;
	},
	genMeshUniforms : function(mesh){
		if(mesh.geometry instanceof THREE.Geometry){
			console.error('Geometry is no longer supported!');
			return false;
		}
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
		if(indices !== null){
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
		}else{
			il = positions.array.length;
			ii = 0;
			while(ii < il){
				pos1 = this.localToWorld( [positions.array[ii], positions.array[ii+1], positions.array[ii+2]], worldMatrix );
				pos2 = this.localToWorld( [positions.array[ii+3], positions.array[ii+4], positions.array[ii+5]], worldMatrix );
				pos3 = this.localToWorld( [positions.array[ii+6], positions.array[ii+7], positions.array[ii+8]], worldMatrix );

				nor = [normals.array[ii] + normals.array[ii+3]+ normals.array[ii+6], normals.array[ii+1] + normals.array[ii+4] + normals.array[ii+7], normals.array[ii+2] + normals.array[ii+5] + normals.array[ii+8]]

				i1 = ii / 3 * 2;

				uv21 = [uv2.array[i1], uv2.array[i1+1]];
				uv22 = [uv2.array[i1+2], uv2.array[i1+3]];
				uv23 = [uv2.array[i1+4], uv2.array[i1+5]];

				ii += 9;
				uniforms.push(this.createTri( pos1, pos2, pos3 , nor, uv21, uv22, uv23));
			}
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
			console.log(light);
			var time = Date.now();
			if(this.directTimer.length === 0){
				console.log('directLight complete :' + (time - this.startTime) / 1000 + 's');
			}else{
				console.log('directLight complete :' + (time - this.directTimer[this.directTimer.length - 1]) / 1000 + 's');
			}
			this.directTimer.push(time);
			this.currentDirectLight = null;

			this.merageBuffer(this.directLightingReadBuffer, this.lightmapReadBuffer, this.lightmapWriteBuffer);
			this.swapLightMapBuffer();

			return;
		}

		var self = this;

		function getPointDirectLightingFragmentShader(material, light){
			var fragmentShader = ShaderLib.pointLightDirectLightingFragmentShader;
			var uniforms = 
			{
				light : {
					value : {
						position : light.position,
						color : light.color,
						distance : light?light.distance:100
					}
				},
				tris : { 
					value : self.uniformArray[light.uniformArrayOffset]
				},
				buffer : { value : light.uniformArrayOffset === 0 ? self.occlusionDefaultTexture : self.directLightingReadBuffer.texture }
			};
			if(material.normalMap){
				uniforms.normalMap = material.normalMap;
				fragmentShader = '#define USER_NORMAL_MAP\n'+ ShaderLib.pointLightDirectLightingFragmentShader;
			}
			var directLightMapMaterial = new THREE.ShaderMaterial({
				uniforms : uniforms,
				vertexShader : ShaderLib.vertexShader,
				fragmentShader : fragmentShader,
			});

			return directLightMapMaterial;
		}

		var i, l, child;
		for(i = 0, l = this.meshs.length; i < l; i++){
			child = this.meshs[i];
			child.material = getPointDirectLightingFragmentShader(this.materialsCache[child.uuid], this.currentDirectLight);
		}
		// this.renderer.clear(true, true, true);
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
				indirectLightingBuffer : { value : this.indirectLightingUniformArrayOffset == 0 ? this.indirectLightingDefaultTexture: this.indirectLightingReadBuffer.texture },
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
		this.indirectLightingUniformArrayOffset += 1;//Math.ceil(Math.random() * 30) ;
	},

	swapLightMapBuffer : function(){
		var temp = this.lightmapReadBuffer;
		this.lightmapReadBuffer = this.lightmapWriteBuffer;
		this.lightmapWriteBuffer = temp;
	},

	merageBuffer : function(buffer1 , buffer2, buffer3){

		this.merageQuad.material.uniforms.buffer1.value = buffer1.texture;
		this.merageQuad.material.uniforms.buffer2.value = buffer2.texture;
		this.merageQuad.material.uniforms.frame.value = this.merageFrame;

		this.renderer.render(this.merageScene, this.viewCamera, buffer3);
		this.merageFrame++;


		return buffer3;

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

		// this.readPixels();
		// this.debug(this.directLightingReadBuffer);
		// throw 123;
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
	readPixels : function(){
		var gl = this.renderer.context;
		var data = new Float32Array(this.width * this.height * 4);

		gl.readPixels(0, 0, this.width, this.height, gl.RGBA , gl.FLOAT, data);
		console.log(data);
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
	exportJSON : function(){
		var link = document.createElement( 'a' );
		link.download = 'scene.gltf';
		var result = this.scene.toJSON();
		var output = JSON.stringify( result, null, 2 );
		var blob = new Blob( [ output ], { type: 'text/plain' } );
		link.href = URL.createObjectURL( blob );
		
		link.click();
	
	},
	restoreScene : function(){

		this.lightmapReadBuffer.texture.flipY = false;
		var child;
		for(var i = 0 , l = this.meshs.length; i < l ; i++){
			child = this.meshs[i];
			
			child.material = this.materialsCache[child.uuid];

			child.material.lightMap = this.lightmapReadBuffer.texture;
			child.material.needUpdate = true;
		
			
		}

		console.log(this.scene);

	},

}

LightMapRenderer.directLighting = 0;
LightMapRenderer.indirectLighting = 1;