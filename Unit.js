var Unit = function(size, reference){
	if(!size) throw "Unit :Property size is empty";
	this.size = size;
	
	this.reference = reference || null;
	
	this.children = reference?null:[];
	this.parent = null;


	this.offsetX = 0;
	this.offsetY = 0;

	this.left = reference?0:4;
}

Unit.minSize = 16;

Unit.prototype = {
	addUnit : function(unit){
		if(this.reference !== null){
			return false;
		}
		
		if(unit instanceof Unit){
			if(unit.size * 2 === this.size){
				return this.addChild(unit);
			}else{
				var i, l, child;
				for(i = 0, l = this.children.length; i < l; i++){
					child = this.children[i];
					if(child.addUnit(unit)){
						return true;
					}
				}
				if(this.haveSpace()){
					var newUnit = this.createChild();
					return newUnit.addUnit(unit);
				}
				
			}

			return false;
		}else{
			console.error('Unit.addUnit parameter must be Unit');
		}
	},
	addChild : function(unit){
		if(this.haveSpace()){
			unit.parent = this;
			this.children.push(unit);
			unit.updateOffset();
			this.left--;
			return true;
		}
		return false;
	},
	createChild : function(){
		var childSize = this.size / 2;
		var l = this.children.length;
		var newUnit = new Unit(childSize);
		newUnit.parent = this;
		this.children.push(newUnit);
		this.left--;
		newUnit.updateOffset();
		return newUnit; 
	},
	removeChild : function(unit){
		if(unit instanceof Unit){
			if(unit.size * 2 == this.size){
				var i, l, child;
				for(i = 0, l = this.children.length; i < l; i++){
					child = this.children[i];
					if(unit === child){
						child.parent = null;
						this.children.splice(i, 1);
						this.left++;
						return true;
					}
				}
			}else{
				var i, l, child;
				for(i = 0, l = this.children.length; i < l; i++){
					child = this.children[i];
					if(child.removeChild(unit)){
						return true;
					}
				}
			}

			return false;
		}else{
			console.error('Unit.addChild parameter must be Unit');
		}
	},
	haveSpace : function(){
		return this.children.length < 4;
	},

	setOffset : function(x, y){
		this.offsetX = x;
		this.offsetY = y;
	},

	updateOffset : function(){
		var size = this.size;
		var l = this.parent.children.length;
		var offset  = Unit.offsets[l-1];
		var x = this.parent.offsetX + offset[0]*size;
		var y = this.parent.offsetY + offset[1]*size;
		this.setOffset(x , y);
	}
}

Unit.offsets = [
	[0,0], [1,0], [0,1], [1,1]
]