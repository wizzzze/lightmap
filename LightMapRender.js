var LightMapRenderer = function(scene,callback){

	this.isBaking = false;
	this.indirectLightingMaxPass = 3;

	this.indirectLightingSamplePass = 1;
	this.indirectLightingSampleMaxPass = 2;


	this.scene = scene;

	this.callback = callback;
	this.renderer = new THREE.WebGLRenderer({
		premultipliedAlpha : false,
	});

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
	this.renderer.setClearColor(new THREE.Color( 0 , 0 , 0 ), 1);
	document.body.appendChild(this.renderer.domElement);

	this.viewScene = new THREE.Scene();
	// this.viewScene.background = new THREE.Color(0,0,0);
	this.viewCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
	this.viewCamera.position.set( 0, 0, 1 );

	var quad = new THREE.PlaneBufferGeometry( 2 , 2 );
	this.viewMaterial = new THREE.ShaderMaterial({
		uniforms : {
			buffer : { value : null },
		},
		vertexShader : ShaderLib.debugVertexShader,
		fragmentShader : ShaderLib.debugFragmentShader
	});

	this.viewQuad = new THREE.Mesh(quad, this.viewMaterial);
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


		this.renderer.setSize(this.width ,this.height);

		this.merageQuad.material.uniforms.res.value = new THREE.Vector2(this.width, this.height);

		this.diffuseMapOutput();

		this.MRAAMapOutput();// output metalness roughness and alpha

		var data = new Float32Array( 4 );
		data[0] = 0;data[1] = 0;data[2] = 0;data[3] = 0;

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
						wrapS: THREE.ClampToEdgeWrapping,
						wrapT: THREE.ClampToEdgeWrapping,
						minFilter: THREE.NearestFilter,
						magFilter: THREE.NearestFilter,
						format: THREE.RGBAFormat,
						type: THREE.FloatType,
						stencilBuffer: false,
						depthBuffer: false
					});

					this.debug(this.lightmapReadBuffer);

					this.indirectLightingReadBuffer = this.indirectLightingWriteBuffer.clone();

					this.indirectLightingMainWriteBuffer = this.indirectLightingWriteBuffer.clone();
					this.indirectLightingMainReadBuffer = this.indirectLightingWriteBuffer.clone();
					
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

			if(this.indirectLightingPass > this.indirectLightingMaxPass){
				
				this.indirectLightingSamplePass++;	

				if(this.indirectLightingSamplePass > this.indirectLightingSampleMaxPass){
					// this.lightmapReadBuffer = this.denoise(this.lightmapReadBuffer);
					this.lightmapReadBuffer = this.blur(this.lightmapReadBuffer);
					//expand

					this.debug(this.lightmapReadBuffer);
					this.expand();

					this.endTime = Date.now();
					this.restoreScene();
					this.callback(this.scene);

					console.log('IndirectLighting complete:'+(this.endTime - this.indirectTimer)/1000+'s');
					console.log('Mission complete:'+(this.endTime - this.startTime)/1000+'s');

					this.isBaking = false;
					return;
				}else{
					this.indirectLightingPass = 0;
				}
			}else{
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

			this.merageToLightMapBuffer(this.directLightingReadBuffer);

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
						color : light.color.clone().multiplyScalar(light.intensity),
						distance : light?light.distance:100,
						decay : 0,
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
			// directLightingMapMaterial.light = light;

			return directLightMapMaterial;
		}

		var i, l, child;
		for(i = 0, l = this.meshs.length; i < l; i++){
			child = this.meshs[i];
			// if(child.material.light && child.material.light == this.currentDirectLight){
			// 	child.material.uniforms.tris.value = self.uniformArray[light.uniformArrayOffset]
			// }else{
				child.material = getPointDirectLightingFragmentShader(this.materialsCache[child.uuid], this.currentDirectLight);
			// }
		}
		
		this.renderer.render(this.scene, this.viewCamera, this.directLightingWriteBuffer);


		var temp = this.directLightingWriteBuffer;
		this.directLightingWriteBuffer = this.directLightingReadBuffer;
		this.directLightingReadBuffer = temp;
		light.uniformArrayOffset++;

		
	},

	directionalLightDirectLighting : function(){
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

			this.merageToLightMapBuffer(this.directLightingReadBuffer);

			return;

		}

		var self = this;
		var direction = (new THREE.Vector3()).subVectors( light.position, light.target.position ).normalize();
		
		function getDirctionalLightDirectLightingFragmentShader(material, light){
			var fragmentShader = ShaderLib.directionalLightDirectLightingFragmentShader;
			var uniforms = 
			{
				light : {
					value : {
						position : light.position,
						direction : direction,
						color : light.color.clone().multiplyScalar(light.intensity),
					}
				},
				tris : { 
					value : self.uniformArray[light.uniformArrayOffset]
				},
				buffer : { value : light.uniformArrayOffset === 0 ? self.occlusionDefaultTexture : self.directLightingReadBuffer.texture }
			};

			if(material.normalMap){
				uniforms.normalMap = material.normalMap;
				fragmentShader = '#define USER_NORMAL_MAP\n'+ ShaderLib.directionalLightDirectLightingFragmentShader;
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
			// if(child.material.light && child.material.light == this.currentDirectLight){
			// 	child.material.uniforms.tris.value = self.uniformArray[light.uniformArrayOffset]
			// }else{
			child.material = getDirctionalLightDirectLightingFragmentShader(this.materialsCache[child.uuid], this.currentDirectLight);
			// }
		}
		// this.renderer.clear(true, true, true);
		this.renderer.render(this.scene, this.viewCamera, this.directLightingWriteBuffer);

		var temp = this.directLightingWriteBuffer;
		this.directLightingWriteBuffer = this.directLightingReadBuffer;
		this.directLightingReadBuffer = temp;
		light.uniformArrayOffset++;
	},
	spotLightDirectLighting : function(){
		this.currentDirectLight = null;
	},

	indirectLighting : function(){

		this.indirectLightingUniformArrayOffset = this.indirectLightingUniformArrayOffset || 0;
		if(this.indirectLightingUniformArrayOffset >= this.uniformArray.length ){
			this.indirectLightingUniformArrayOffset = 0;
			this.indirectLightingPass++;
			this.indirectLightingReadBuffer = this.blur2(this.indirectLightingReadBuffer);

			this.debug(this.indirectLightingReadBuffer);
		
			// this.merageBuffer(this.indirectLightingReadBuffer, this.indirectLightingMainReadBuffer, this.indirectLightingMainWriteBuffer);
			this.merageBuffer(this.indirectLightingReadBuffer, this.lightmapReadBuffer, this.lightmapWriteBuffer);
			this.swapLightMapBuffer();
			// var temp = this.indirectLightingMainWriteBuffer;
			// this.indirectLightingMainWriteBuffer = this.indirectLightingMainReadBuffer;
			// this.indirectLightingMainReadBuffer = temp;
			return;

			// this.debug(this.indirectLightingMainReadBuffer);
		}

		var indirectLightMapMaterial = new THREE.ShaderMaterial({
			uniforms : {
				resolution :{ value : new THREE.Vector2(this.width, this.height)},
				frame : this.indirectLightingPass + this.indirectLightingSamplePass * this.indirectLightingMaxPass,
				lightBuffer : { value : this.lightmapReadBuffer.texture },
				diffuseBuffer : { value : this.diffuseBuffer.texture },
				indirectLightingBuffer : { value : this.indirectLightingUniformArrayOffset == 0 ? this.indirectLightingDefaultTexture: this.indirectLightingReadBuffer.texture },
				tris : { 
					value : this.uniformArray[this.indirectLightingUniformArrayOffset]
				},
				sampleRays : { value : this.indirectLightingMaxPass * this.indirectLightingSampleMaxPass}
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
	merageToLightMapBuffer : function(buffer){
		this.merageBuffer(buffer, this.lightmapReadBuffer, this.lightmapWriteBuffer);
		this.swapLightMapBuffer();
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
	indexOutput : function(){
		var scene = this.scene;
		var child;

		function getIndexMaterail(i){
			return new THREE.ShaderMaterial({
				uniforms : {
					index : { value : i},
				},
				vertexShader : ShaderLib.vertexShader,
				fragmentShader : ShaderLib.indexOutputShader,
			});

		}

		for(var i = 0, l = this.meshs.length; i < l; i++ ){
			child = this.meshs[i];
			child.material = getIndexMaterail(i+1);
			// child.material.uniforms.index.value = i;
		}

		this.indexBuffer = new THREE.WebGLRenderTarget( this.width, this.height, {
			wrapS: THREE.RepeatWrapping,
			wrapT: THREE.RepeatWrapping,
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter,
			format: THREE.RGBAFormat,
			type: THREE.FloatType,
			stencilBuffer: false,  
			depthBuffer: false
		});

		this.renderer.setClearColor(new THREE.Color( 0 , 0 , 0 ), 1);
		this.renderer.render(this.scene, this.viewCamera, this.indexBuffer);

	},
	positionMapOutput : function(){
		var scene = this.scene;
		var child;

		var positionOutputMaterial = new THREE.ShaderMaterial({
			uniforms : {},
			vertexShader : ShaderLib.vertexShader,
			fragmentShader : ShaderLib.positionOutputShader
		});

		for(var i = 0 , l = this.meshs.length; i < l ; i++){
			child = this.meshs[i];
			child.material = positionOutputMaterial;
			
		}
		this.positionBuffer = new THREE.WebGLRenderTarget( this.width, this.height, {
			wrapS: THREE.RepeatWrapping,
			wrapT: THREE.RepeatWrapping,
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter,
			format: THREE.RGBAFormat,
			type: THREE.FloatType,
			stencilBuffer: false,  
			depthBuffer: false
		});

		this.renderer.setClearColor(new THREE.Color( 0 , 0 , 0 ), 0);
		this.renderer.render(this.scene, this.viewCamera, this.positionBuffer);

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

		this.renderer.setClearColor(new THREE.Color( 0 , 0 , 0 ), 0);
		this.renderer.render(this.scene, this.viewCamera, this.diffuseBuffer);
	},

	MRAAMapOutput: function(){
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

			if(material.aoMap){
				fragmentShader.push('#define USE_AO_MAP');
				uniforms.roughnessMap = { value : material.aoMap } ;
			}

			if(material.alphaMap){
				fragmentShader.push('#define USE_ALPHA_MAP');
				uniforms.alphaMap = { value : material.alphaMap } ;
			}

			if(material.opacity < 1){
				fragmentShader.push('#define USE_OPACITY');
				uniforms.uOpacity = { value : material.opacity } ;
			}
			

			fragmentShader.push(ShaderLib.MRAAOutputShader);
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

		this.MRAABuffer = new THREE.WebGLRenderTarget( 512, 512, {
			wrapS: THREE.RepeatWrapping,
			wrapT: THREE.RepeatWrapping,
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter,
			format: THREE.RGBAFormat,
			type: THREE.FloatType,
			stencilBuffer: false,  
			depthBuffer: false
		});
		this.renderer.setClearColor(new THREE.Color( 0 , 0 , 0 ), 0);
		this.renderer.render(this.scene, this.viewCamera, this.MRAABuffer);


		
	},

	blur : function(buffer){
		this.viewQuad.material = new THREE.ShaderMaterial({
			uniforms : {
				buffer : {value : buffer.texture} ,
				resolution : {value : new THREE.Vector2(this.width, this.height)}
			},
			vertexShader : ShaderLib.debugVertexShader,
			fragmentShader : ShaderLib.blurFragmentShader,
		});

		var temp = buffer.clone();

		this.renderer.setClearColor(new THREE.Color( 0 , 0 , 0 ), 0);
		this.renderer.render(this.viewScene, this.viewCamera, temp);
		return temp;

	},

	blur2 : function(buffer){
		if(!this.indexBuffer){
			this.indexOutput();

		}

		this.viewQuad.material = new THREE.ShaderMaterial({
			uniforms : {
				buffer : {value : buffer.texture} ,
				indexBuffer : { value : this.indexBuffer.texture },
				// positionBuffer : { value : this.positionBuffer.texture },
				resolution : {value : new THREE.Vector2(this.width, this.height)},
			},
			vertexShader : ShaderLib.debugVertexShader,
			fragmentShader : ShaderLib.denoise2FragmentShader,
		});

		var temp = buffer.clone();

		this.renderer.render(this.viewScene, this.viewCamera, temp);
		
		return temp;

	},

	denoise : function(buffer){

		if(this.positionBuffer == undefined) this.positionMapOutput();

		var data = new Float32Array( 4 );
		data[0] = 0;data[1] = 0;data[2] = 0;data[3] = 0;

		var texture = new THREE.DataTexture( data, 1, 1, THREE.RGBAFormat, THREE.FloatType );

		this.viewQuad.material = new THREE.ShaderMaterial({
			uniforms : {
				noiseBuffer : { value : buffer.texture },
				positionBuffer : { value : this.positionBuffer.texture},
				readBuffer : { value : texture },
				radius : { value : 12 },
				strength : { value : 3},
				step : { value : null },
				resolution : { value : new THREE.Vector2(this.width, this.height) },
				frame : { value : null },

			},
			vertexShader : ShaderLib.debugVertexShader,
			fragmentShader : ShaderLib.denoiseFragmentShader,
		});
		var writeBuffer = new THREE.WebGLRenderTarget( buffer.width, buffer.height, {
			wrapS: THREE.ClampToEdgeWrapping,
			wrapT: THREE.ClampToEdgeWrapping,
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter,
			format: THREE.RGBAFormat,
			type: THREE.FloatType,
			stencilBuffer: false,
			depthBuffer: false
		});
		var readBuffer = writeBuffer.clone();

		for(var i = 0, l = 16; i < l; i++){
			var a = Math.random();
			var b = Math.random() - a;
			var step = new THREE.Vector2(a, b);

			if(i != 0){
				this.viewQuad.material.uniforms.readBuffer.value = readBuffer.texture;
			}
			this.viewQuad.material.uniforms.frame.value = i;
			this.viewQuad.material.uniforms.step.value = step;

			this.renderer.render(this.viewScene, this.viewCamera, writeBuffer);
			var temp = writeBuffer;
			writeBuffer = readBuffer;
			readBuffer = temp;
		}
		return readBuffer;

	},

	expand: function(){

		//cpu version

		
		var gl = this.renderer.context;


		this.data = new Float32Array(this.width * this.height * 4);
		this.renderer.readRenderTargetPixels(this.lightmapReadBuffer, 0, 0, this.width, this.height, this.data);

		this.expandData = new THREE.DataTexture(this.width * this.height * 4);
		var units = this.uv2.units;

		for(var i = 0, l = units.length; i < l ; i++){
			this.expandUnit(units[i]);
		}
		// var png = UPNG.encode([this.expandData], this.width, this.height, 0);
		// console.log(png);

		console.log(this.expandData);
		var dataTexture = new THREE.DataTexture(this.expandData,  this.width, this.height, THREE.RGBAFormat);

		this.debug(dataTexture);
		throw 123;
		

		//gpu version

		// var expandMaterial = new THREE.ShaderMaterial({
		// 	uniforms : {
		// 		buffer : { value : this.lightmapReadBuffer.texture },
		// 		indexBuffer : { value : this.indexBuffer.texture },

		// 	},

		// 	vertexShader : ShaderLib.debugVertexShader,
		// 	fragmentShader : ShaderLib.expand,
		// });

		// this.viewQuad.material = expandMaterial;
		// this.renderer.render(this.viewScene, this.viewCamera, this.lightmapWriteBuffer);
		// this.swapLightMapBuffer();
		// this.debug(this.lightmapReadBuffer);
		// throw 123;

	},
	expandUnit : function(unit){
		if(unit.childre == null){
			var offsetX = unit.offsetX;
			var offsetY = unit.offsetY;

			var padding = this.uv2.padding;

			for(var i = 0; i < unit.size; i++){
				for(var j = 0; j < unit.size; j++){
					var readOffsetX, readOffsetY;
					var needExpandX = true;
					var needExpandY = true;
					if( i < padding ){
						readOffsetX = offsetX + padding - i;
					}else if(i > unit.width - padding){
						readOffsetX = offsetX + unit.width - padding + i;
					}else{
						readOffsetX = offsetX + i;
						needExpandX = false;
					}

					if( j < padding ){
						readOffsetY = offsetY + padding - j;
					}else if(j > unit.height - padding){
						readOffsetY = offsetY + unit.heihgt - padding + j;
					}else{
						readOffsetY = offsetY + j;
						needExpandY = false;
					}

					var currentIndex = ((offsetY + j) * this.width + offsetX + i) * 4;
					
					var readIndex = (readOffsetY * this.width + readOffsetX) * 4;
					
					if(needExpandX == false && needExpandY == false){
						this.expandData[currentIndex] = this.data[currentIndex];
						this.expandData[currentIndex + 1] = this.data[currentIndex + 1];
						this.expandData[currentIndex + 2] = this.data[currentIndex + 2];
						this.expandData[currentIndex + 3] = this.data[currentIndex + 3];
					}else{
						this.expandData[currentIndex] = this.data[readIndex];
						this.expandData[currentIndex + 1] = this.data[readIndex + 1];
						this.expandData[currentIndex + 2] = this.data[readIndex + 2];
						this.expandData[currentIndex + 3] = this.data[readIndex + 3];
					}
				}

			}

		}else{
			for(var i = 0; i < unit.children.length; i++){
				expandUnit(unit.children[i]);
			}
		}
	},
	debug: function( buffer ){
		var texture;
		if(buffer instanceof THREE.WebGLRenderTarget){
			texture = buffer.texture;
		}else{
			console.log(buffer);
			texture = buffer;
		}
		this.viewQuad.material = this.viewMaterial;
		this.viewQuad.material.uniforms.buffer.value = texture;
		this.renderer.render(this.viewScene, this.viewCamera);
		return;
	},
	readPixels : function(){
		var gl = this.renderer.context;
		var data = new Float32Array(this.width * this.height * 4);

		gl.readPixels(0, 0, this.width, this.height, gl.RGBA , gl.FLOAT, data);
		return data;
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

		// this.lightmapReadBuffer.texture.flipY = false;
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